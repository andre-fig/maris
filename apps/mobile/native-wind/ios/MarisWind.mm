#include "../cpp/WindCore.hpp"
#include "../cpp/WindShaders.hpp"
#import <ImageIO/ImageIO.h>
#import <MapLibre/MapLibre.h>
#import <MetalKit/MetalKit.h>
#import <React/RCTViewManager.h>
#include <atomic>
#import <mach/mach.h>
static maris::TileCache tileCache;

@interface MarisWindLayer : MLNCustomStyleLayer
@property float windOpacity;
@property float density;
@property float animationSpeed;
- (void)load:(maris::Plan)plan;
@end

@implementation MarisWindLayer {
  id<MTLDevice> _device;
  id<MTLRenderPipelineState> _heat, _trails;
  id<MTLDepthStencilState> _depth;
  id<MTLTexture> _texture;
  std::shared_ptr<maris::Field> _field;
  maris::Particles _particles;
  maris::RenderStats _stats;
  BOOL _measure;
  NSString *_key;
  NSURLSession *_session;
  dispatch_queue_t _loader;
  std::atomic<NSUInteger> _generation;
  double _loadedAt, _previous;
  float _quality;
}
- (instancetype)initWithIdentifier:(NSString *)identifier {
  if ((self = [super initWithIdentifier:identifier])) {
    _generation.store(0);
    _measure = [NSProcessInfo.processInfo.environment[@"MARIS_WIND_METRICS"]
        boolValue];
#if DEBUG
    _measure = YES;
#endif
    _windOpacity = .65;
    _density = .6;
    _animationSpeed = 1;
    _quality = 1;
    _loader =
        dispatch_queue_create("com.maris.wind.loader", DISPATCH_QUEUE_SERIAL);
    NSURLSessionConfiguration *config =
        NSURLSessionConfiguration.defaultSessionConfiguration;
    config.HTTPAdditionalHeaders =
        @{@"User-Agent" : @"Maris/1.0 (https://github.com/andre-fig/maris)"};
    config.timeoutIntervalForRequest = 15;
    config.URLCache =
        [[NSURLCache alloc] initWithMemoryCapacity:8 * 1024 * 1024
                                      diskCapacity:32 * 1024 * 1024
                                          diskPath:@"maris-wind"];
    _session = [NSURLSession sessionWithConfiguration:config];
  }
  return self;
}
- (void)didMoveToMapView:(MLNMapView *)map {
  MLNBackendResource *r = map.backendResource;
  _device = r.device;
  NSError *error = nil;
  auto source = maris::metalShader();
  id<MTLLibrary> lib = [_device newLibraryWithSource:@(source.c_str())
                                             options:nil
                                               error:&error];
  if (!lib) {
    NSLog(@"[Wind] Metal shader error: %@", error);
    return;
  }
  for (int pass = 0; pass < 2; pass++) {
    MTLRenderPipelineDescriptor *d = [MTLRenderPipelineDescriptor new];
    d.vertexFunction = [lib newFunctionWithName:@"windVertex"];
    d.fragmentFunction =
        [lib newFunctionWithName:pass ? @"particleFragment" : @"windFragment"];
    d.colorAttachments[0].pixelFormat = r.mtkView.colorPixelFormat;
    d.depthAttachmentPixelFormat = MTLPixelFormatDepth32Float_Stencil8;
    d.stencilAttachmentPixelFormat = MTLPixelFormatDepth32Float_Stencil8;
    d.rasterSampleCount = r.mtkView.sampleCount;
    auto c = d.colorAttachments[0];
    c.blendingEnabled = YES;
    c.sourceRGBBlendFactor =
        pass ? MTLBlendFactorOne : MTLBlendFactorDestinationColor;
    c.destinationRGBBlendFactor = MTLBlendFactorOneMinusSourceAlpha;
    c.sourceAlphaBlendFactor = MTLBlendFactorOne;
    c.destinationAlphaBlendFactor = MTLBlendFactorOneMinusSourceAlpha;
    id<MTLRenderPipelineState> pipeline =
        [_device newRenderPipelineStateWithDescriptor:d error:&error];
    if (!pipeline)
      NSLog(@"[Wind] Metal pipeline error: %@", error);
    if (pass)
      _trails = pipeline;
    else
      _heat = pipeline;
  }
  MTLDepthStencilDescriptor *depth = [MTLDepthStencilDescriptor new];
  depth.depthCompareFunction = MTLCompareFunctionAlways;
  depth.depthWriteEnabled = NO;
  _depth = [_device newDepthStencilStateWithDescriptor:depth];
}
- (NSData *)fetch:(NSString *)url {
  dispatch_semaphore_t done = dispatch_semaphore_create(0);
  __block NSData *result = nil;
  [[_session dataTaskWithURL:[NSURL URLWithString:url]
           completionHandler:^(NSData *data, NSURLResponse *response,
                               NSError *error) {
             if (!error && [(NSHTTPURLResponse *)response statusCode] == 200)
               result = data;
             dispatch_semaphore_signal(done);
           }] resume];
  dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
  return result;
}
- (void)load:(maris::Plan)p {
  NSString *key = @(p.key().c_str());
  double now = CACurrentMediaTime();
  if ([key isEqual:_key] && now - _loadedAt < 60)
    return;
  _key = key;
  _loadedAt = now;
  NSUInteger generation = ++_generation;
  __weak MarisWindLayer *weak = self;
  dispatch_async(_loader, ^{
    MarisWindLayer *owner = weak;
    if (!owner || generation != owner->_generation)
      return;
    NSData *catalog =
        [owner fetch:@"https://beta.yr-maps.met.no/api/wind/available.json"];
    if (!catalog)
      return;
    NSDictionary *json = [NSJSONSerialization JSONObjectWithData:catalog
                                                         options:0
                                                           error:nil];
    NSArray *times = json[@"times"];
    if (!times.count)
      return;
    NSString *url = times[0][@"tiles"][@"png"];
    if (!url)
      return;
    auto field = std::make_shared<maris::Field>(p);
    for (int y = p.top; y <= p.bottom; y++)
      for (int x = p.left; x <= p.right; x++) {
        @autoreleasepool {
          if (generation != owner->_generation)
            return;
          int n = 1 << p.z, wrapped = (x % n + n) % n;
          NSString *tile =
              [[[url stringByReplacingOccurrencesOfString:@"{z}"
                                               withString:@(p.z).stringValue]
                  stringByReplacingOccurrencesOfString:@"{x}"
                                            withString:@(wrapped).stringValue]
                  stringByReplacingOccurrencesOfString:@"{y}"
                                            withString:@(y).stringValue];
          if (tileCache.copy(tile.UTF8String, *field, x, y))
            continue;
          NSData *data = [owner fetch:tile];
          if (!data)
            continue;
          CGImageSourceRef source =
              CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
          if (!source)
            continue;
          CGImageRef image = CGImageSourceCreateImageAtIndex(source, 0, NULL);
          CFRelease(source);
          if (!image)
            continue;
          if (CGImageGetWidth(image) == 256 && CGImageGetHeight(image) == 256) {
            std::vector<uint8_t> bytes(256 * 256 * 4);
            CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
            CGContextRef context = CGBitmapContextCreate(
                bytes.data(), 256, 256, 8, 1024, space,
                kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
            CGColorSpaceRelease(space);
            if (context) {
              CGContextDrawImage(context, CGRectMake(0, 0, 256, 256), image);
              CGContextRelease(context);
              field->put(x, y, bytes.data(), 1024);
              tileCache.put(tile.UTF8String, bytes.data());
            }
          }
          CGImageRelease(image);
        }
      }
    dispatch_async(dispatch_get_main_queue(), ^{
      if (generation != owner->_generation || !field->received)
        return;
      owner->_field = field;
      owner->_texture = nil;
      NSLog(@"[Wind] atlas %dx%d tiles=%d load=%.2fs", p.width(), p.height(),
            field->received, CACurrentMediaTime() - now);
      [owner setNeedsDisplay];
    });
  });
}
- (void)drawInMapView:(MLNMapView *)map
          withContext:(MLNStyleLayerDrawingContext)context {
  if (!_field || !_heat || !self.renderEncoder)
    return;
  _stats.begin();
  auto f = _field;
  if (!_texture) {
    auto d = [MTLTextureDescriptor
        texture2DDescriptorWithPixelFormat:MTLPixelFormatRGBA8Unorm
                                     width:f->plan.width()
                                    height:f->plan.height()
                                 mipmapped:NO];
    d.usage = MTLTextureUsageShaderRead;
    d.storageMode = MTLStorageModeShared;
    _texture = [_device newTextureWithDescriptor:d];
    [_texture
        replaceRegion:MTLRegionMake2D(0, 0, f->plan.width(), f->plan.height())
          mipmapLevel:0
            withBytes:f->rgba.data()
          bytesPerRow:f->plan.width() * 4];
  }
  const double *matrix = &context.projectionMatrix.m00;
  auto vertices = maris::quad(f->plan, matrix, context.zoomLevel);
  id<MTLRenderCommandEncoder> encoder = self.renderEncoder;
  [encoder setCullMode:MTLCullModeNone];
  [encoder setDepthStencilState:_depth];
  [encoder setRenderPipelineState:_heat];
  [encoder setVertexBytes:vertices.data() length:sizeof(vertices) atIndex:0];
  [encoder setFragmentTexture:_texture atIndex:0];
  float opacity = _windOpacity;
  [encoder setFragmentBytes:&opacity length:sizeof(opacity) atIndex:0];
  [encoder drawPrimitives:MTLPrimitiveTypeTriangleStrip
              vertexStart:0
              vertexCount:4];
  double now = CACurrentMediaTime(),
         dt = _previous ? std::min(.05, now - _previous) : 0;
  _previous = now;
  if (dt > .035)
    _quality = std::max(.2f, _quality - .005f);
  else
    _quality = std::min(1.f, _quality + .001f);
  const auto &lines = _particles.update(*f, matrix, context.zoomLevel, dt,
                                        _density * _quality, _animationSpeed);
  if (!lines.empty() && _trails) {
    // Metal setVertexBytes is limited to 4 KiB; stream through a native buffer.
    id<MTLBuffer> buffer =
        [_device newBufferWithBytes:lines.data()
                             length:lines.size() * sizeof(maris::ClipVertex)
                            options:MTLResourceStorageModeShared];
    [encoder setRenderPipelineState:_trails];
    [encoder setVertexBuffer:buffer offset:0 atIndex:0];
    [encoder drawPrimitives:MTLPrimitiveTypeLine
                vertexStart:0
                vertexCount:lines.size()];
  }
  if (_measure && _stats.end()) {
    task_vm_info_data_t memory{};
    mach_msg_type_number_t count = TASK_VM_INFO_COUNT;
    task_info(mach_task_self(), TASK_VM_INFO, (task_info_t)&memory, &count);
    NSLog(@"[Wind] render callbacks=%.1f/s cpu=%.3fms atlasBytes=%zu "
          @"vertices=%zu processFootprintMiB=%.1f",
          _stats.fps, _stats.averageCpuMs, f->rgba.size(), lines.size(),
          memory.phys_footprint / 1048576.);
  }
}
- (void)willMoveFromMapView:(MLNMapView *)map {
  ++_generation;
  _key = nil;
  _texture = nil;
  _field.reset();
  _heat = nil;
  _trails = nil;
  _depth = nil;
  _previous = 0;
}
- (void)dealloc {
  [_session invalidateAndCancel];
}
@end

static MLNMapView *findMap(UIView *view) {
  if ([view isKindOfClass:MLNMapView.class])
    return (MLNMapView *)view;
  for (UIView *child in view.subviews) {
    MLNMapView *map = findMap(child);
    if (map)
      return map;
  }
  return nil;
}
@interface MarisWindControl : UIView
@property BOOL enabled;
@property float opacity;
@property float density;
@property float animationSpeed;
@end
@implementation MarisWindControl {
  __weak MLNMapView *_map;
  MarisWindLayer *_layer;
  CADisplayLink *_clock;
  double _check;
  BOOL _validationApplied;
  double _validationAfter;
}
- (instancetype)init {
  if ((self = [super init])) {
    _opacity = .65;
    _density = .6;
    _animationSpeed = 1;
    self.userInteractionEnabled = NO;
  }
  return self;
}
- (void)didMoveToWindow {
  [super didMoveToWindow];
  [_clock invalidate];
  _clock = nil;
  if (self.window) {
    _clock = [CADisplayLink displayLinkWithTarget:self
                                         selector:@selector(tick:)];
    _clock.preferredFramesPerSecond = 60;
    [_clock addToRunLoop:NSRunLoop.mainRunLoop forMode:NSRunLoopCommonModes];
  } else {
    if (_layer.style)
      [_layer.style removeLayer:_layer];
    _layer = nil;
    _map = nil;
  }
}
- (void)tick:(CADisplayLink *)clock {
  BOOL active = _enabled && _opacity > 0 &&
                UIApplication.sharedApplication.applicationState ==
                    UIApplicationStateActive;
  if (!active) {
    if (_layer.style)
      [_layer.style removeLayer:_layer];
    _layer = nil;
    return;
  }
  if (!_map) {
    for (UIView *parent = self.superview; parent && !_map;
         parent = parent.superview)
      _map = findMap(parent);
  }
  if (!_map.style)
    return;
#if DEBUG
  // Explicit opt-in test fixture; never changes the camera in normal launches.
  if (!_validationAfter)
    _validationAfter = CACurrentMediaTime() + 2;
  if (!_validationApplied && CACurrentMediaTime() > _validationAfter) {
    _validationApplied = YES;
    NSArray *v = [NSProcessInfo.processInfo.environment[@"MARIS_WIND_CAMERA"]
        componentsSeparatedByString:@","];
    if (v.count == 5) {
      [_map setCenterCoordinate:CLLocationCoordinate2DMake([v[1] doubleValue],
                                                           [v[0] doubleValue])
                      zoomLevel:[v[2] doubleValue]
                      direction:[v[3] doubleValue]
                       animated:NO];
      MLNMapCamera *camera = _map.camera;
      camera.pitch = [v[4] doubleValue];
      [_map setCamera:camera animated:NO];
    }
  }
#endif
  if (!_layer.style) {
    _layer = [[MarisWindLayer alloc] initWithIdentifier:@"maris-native-wind"];
    MLNStyleLayer *before =
        [_map.style layerWithIdentifier:@"miami-soundg-depth"];
    if (!before)
      before = [_map.style layerWithIdentifier:@"water_name_point_label"];
    if (before)
      [_map.style insertLayer:_layer belowLayer:before];
    else
      [_map.style addLayer:_layer];
  }
  _layer.windOpacity = _opacity;
  _layer.density = _density;
  _layer.animationSpeed = _animationSpeed;
  if (clock.timestamp - _check > .35) {
    _check = clock.timestamp;
    auto b = _map.visibleCoordinateBounds;
    [_layer load:maris::plan(b.sw.longitude, b.sw.latitude, b.ne.longitude,
                             b.ne.latitude, _map.zoomLevel)];
  }
  if (_density > 0)
    [_layer setNeedsDisplay];
}
@end
@interface MarisWindControlManager : RCTViewManager
@end
@implementation MarisWindControlManager
RCT_EXPORT_MODULE(MarisWindControl)
- (UIView *)view {
  return [MarisWindControl new];
}
RCT_EXPORT_VIEW_PROPERTY(enabled, BOOL)
RCT_EXPORT_VIEW_PROPERTY(opacity, float)
RCT_EXPORT_VIEW_PROPERTY(density, float)
RCT_EXPORT_VIEW_PROPERTY(animationSpeed, float)
@end
