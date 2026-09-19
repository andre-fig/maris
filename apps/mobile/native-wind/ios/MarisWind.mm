#include "../cpp/WindCore.hpp"
#include "../cpp/WindResources.hpp"
#include "../cpp/WindFade.hpp"
#include "../cpp/WindShaders.hpp"
#import <ImageIO/ImageIO.h>
#import <MapLibre/MapLibre.h>
#import <MetalKit/MetalKit.h>
#import <React/RCTViewManager.h>
#include <atomic>
#import <mach/mach.h>
static maris::TileCache tileCache;

@interface MarisWindLayer : MLNCustomStyleLayer
@property float particleOpacity;
@property float density;
@property float animationSpeed;
@property BOOL windVisible;
@property (copy) void (^dataStatus)(BOOL stale, double savedAt, BOOL loading);
- (void)load:(maris::Plan)plan;
- (void)resetRequests;
- (int)resolutionPenalty;
- (int)maximumDimension;
- (BOOL)fadeFinished;
- (double)speedAtCenter:(CLLocationCoordinate2D)center;
- (void)setGfsField:(NSDictionary *)payload;
@end

@implementation MarisWindLayer {
  id<MTLDevice> _device;
  id<MTLRenderPipelineState> _trails;
  id<MTLDepthStencilState> _depth;
  std::shared_ptr<maris::Field> _oldField;
  maris::WindFade _fieldTransition;
  std::shared_ptr<maris::Field> _field;
  maris::Particles _particles;
  std::vector<maris::ClipVertex> _trailMesh;
  maris::RenderStats _stats;
  BOOL _measure;
  NSString *_key;
  NSURLSession *_session;
  dispatch_queue_t _loader;
  std::atomic<NSUInteger> _generation;
  double _nextLoadAt, _previous, _dataSavedAt;
  BOOL _loading;
  maris::Quality _quality;
  maris::WindFade _fade;
  NSString *_snapshotPath;
  NSString *_catalogPath;
  NSString *_gfsKey;
  NSURLSessionDataTask *_activeTask;
  id<MTLBuffer> _buffers[3];
  std::shared_ptr<std::array<std::atomic_bool, 3>> _busy;
}
- (instancetype)initWithIdentifier:(NSString *)identifier {
  if ((self = [super initWithIdentifier:identifier])) {
    _generation.store(0);
    _measure = [NSProcessInfo.processInfo.environment[@"MARIS_WIND_METRICS"]
        boolValue];
#if DEBUG
    _measure = YES;
#endif
    _particleOpacity = .65;
    _density = .6;
    _animationSpeed = 1;
    _quality = maris::Quality(NSProcessInfo.processInfo.physicalMemory <= 3ULL*1024*1024*1024 || NSProcessInfo.processInfo.lowPowerModeEnabled);
    _busy = std::make_shared<std::array<std::atomic_bool, 3>>();
    for (auto &busy : *_busy) busy.store(false);
    static dispatch_queue_t loader;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ loader = dispatch_queue_create("com.maris.wind.loader", DISPATCH_QUEUE_SERIAL); });
    _loader = loader;
    NSURL *directory = [[NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject URLByAppendingPathComponent:@"maris-wind" isDirectory:YES];
    [NSFileManager.defaultManager createDirectoryAtURL:directory withIntermediateDirectories:YES attributes:nil error:nil];
    [directory setResourceValue:@YES forKey:NSURLIsExcludedFromBackupKey error:nil];
    _snapshotPath = [directory URLByAppendingPathComponent:@"last-field.bin"].path;
    _catalogPath = [directory URLByAppendingPathComponent:@"last-catalog.json"].path;
    NSURLSessionConfiguration *config =
        NSURLSessionConfiguration.defaultSessionConfiguration;
    config.HTTPAdditionalHeaders =
        @{@"User-Agent" : @"Maris/1.0 (https://github.com/andre-fig/maris)"};
    config.timeoutIntervalForRequest = 5;
    config.timeoutIntervalForResource = 5;
    config.URLCache =
        [[NSURLCache alloc] initWithMemoryCapacity:2 * 1024 * 1024
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
  MTLRenderPipelineDescriptor *d = [MTLRenderPipelineDescriptor new];
  d.vertexFunction = [lib newFunctionWithName:@"windVertex"];
  d.fragmentFunction = [lib newFunctionWithName:@"particleFragment"];
  d.colorAttachments[0].pixelFormat = r.mtkView.colorPixelFormat;
  d.depthAttachmentPixelFormat = MTLPixelFormatDepth32Float_Stencil8;
  d.stencilAttachmentPixelFormat = MTLPixelFormatDepth32Float_Stencil8;
  d.rasterSampleCount = r.mtkView.sampleCount;
  auto c = d.colorAttachments[0];
  c.blendingEnabled = YES;
  c.sourceRGBBlendFactor = MTLBlendFactorOne;
  c.destinationRGBBlendFactor = MTLBlendFactorOneMinusSourceAlpha;
  c.sourceAlphaBlendFactor = MTLBlendFactorOne;
  c.destinationAlphaBlendFactor = MTLBlendFactorOneMinusSourceAlpha;
  _trails = [_device newRenderPipelineStateWithDescriptor:d error:&error];
  if (!_trails)
    NSLog(@"[Wind] Metal pipeline error: %@", error);
  MTLDepthStencilDescriptor *depth = [MTLDepthStencilDescriptor new];
  depth.depthCompareFunction = MTLCompareFunctionAlways;
  depth.depthWriteEnabled = NO;
  _depth = [_device newDepthStencilStateWithDescriptor:depth];
}
- (double)speedAtCenter:(CLLocationCoordinate2D)center {
  return maris::speedAtCoordinate(_field.get(), center.longitude, center.latitude);
}
- (void)setGfsField:(NSDictionary *)payload {
  NSDictionary *bounds = payload[@"bounds"];
  if (!payload) {
    if (_gfsKey == nil && !_field) return;
    _gfsKey = nil;
    _oldField.reset();
    _field.reset();
    _particles = maris::Particles();
    return;
  }
  NSArray *uValues = payload[@"windU"];
  NSArray *vValues = payload[@"windV"];
  NSInteger width = [payload[@"width"] integerValue];
  NSInteger height = [payload[@"height"] integerValue];
  if (![bounds isKindOfClass:NSDictionary.class] || width <= 0 || height <= 0 ||
      uValues.count != (NSUInteger)(width * height) ||
      vValues.count != (NSUInteger)(width * height)) return;
  NSString *key = [NSString stringWithFormat:@"%@|%@|%@|%@|%@|%@|%@|%@|%@",
      payload[@"run"] ?: @"", payload[@"model"] ?: @"", payload[@"forecastTime"] ?: @"",
      bounds[@"west"] ?: @"", bounds[@"south"] ?: @"", bounds[@"east"] ?: @"",
      bounds[@"north"] ?: @"", payload[@"width"] ?: @"", payload[@"height"] ?: @""];
  if ([key isEqualToString:_gfsKey]) return;
  _gfsKey = [key copy];
  std::vector<float> u(size_t(width * height)), v(size_t(width * height));
  std::vector<uint8_t> valid(size_t(width * height), 1);
  for (NSInteger i = 0; i < width * height; ++i) {
    NSNumber *un = uValues[i], *vn = vValues[i];
    if (![un isKindOfClass:NSNumber.class] || ![vn isKindOfClass:NSNumber.class] ||
        !std::isfinite(un.doubleValue) || !std::isfinite(vn.doubleValue)) {
      valid[size_t(i)] = 0;
      continue;
    }
    u[size_t(i)] = un.floatValue;
    v[size_t(i)] = vn.floatValue;
  }
  auto next = std::make_shared<maris::Field>(
      [bounds[@"west"] doubleValue], [bounds[@"south"] doubleValue],
      [bounds[@"east"] doubleValue], [bounds[@"north"] doubleValue],
      int(width), int(height), std::move(u), std::move(v), std::move(valid));
  _oldField = _field;
  _fieldTransition = maris::WindFade();
  _field = std::move(next);
  _loading = NO;
  _nextLoadAt = CACurrentMediaTime() + 60;
  if (self.dataStatus) self.dataStatus(NO, NSDate.date.timeIntervalSince1970, NO);
  [self setNeedsDisplay];
}
- (NSData *)fetch:(NSString *)url cacheOnly:(BOOL)cacheOnly {
  dispatch_semaphore_t done = dispatch_semaphore_create(0);
  __block NSData *result = nil;
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:url]];
  request.cachePolicy = cacheOnly ? NSURLRequestReturnCacheDataDontLoad : NSURLRequestUseProtocolCachePolicy;
  NSURLSessionDataTask *task = [_session dataTaskWithRequest:request
           completionHandler:^(NSData *data, NSURLResponse *response,
                               NSError *error) {
             if (!error && [(NSHTTPURLResponse *)response statusCode] == 200)
               result = data;
             dispatch_semaphore_signal(done);
           }];
  @synchronized (self) { _activeTask = task; }
  [task resume];
  dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
  @synchronized (self) { if (_activeTask == task) _activeTask = nil; }
  return result;
}
- (NSData *)fetch:(NSString *)url { return [self fetch:url cacheOnly:NO]; }
- (void)cancelActiveRequest {
  @synchronized (self) { [_activeTask cancel]; _activeTask = nil; }
}
- (void)resetRequests {
  ++_generation;
  [self cancelActiveRequest];
  _key = nil;
  _loading = NO;
  _nextLoadAt = 0;
}
- (void)load:(maris::Plan)p {
  // Disabled: the React Native GFS client owns acquisition, cache coverage,
  // and the resident vector field. Native never falls back to MET Norway.
  return;
  /*
  NSString *key = @(p.key().c_str());
  double now = CACurrentMediaTime();
  if ([key isEqual:_key] && (_loading || now < _nextLoadAt))
    return;
  _key = key;
  _loading = YES;
  if (self.dataStatus) self.dataStatus(YES, _dataSavedAt, YES);
  [self cancelActiveRequest];
  if (_field && !maris::overlaps(_field->plan, p)) {
    _oldField.reset();
    _field.reset();
    _particles = maris::Particles();
    std::vector<maris::ClipVertex>().swap(_trailMesh);
    for (int i = 0; i < 3; ++i) _buffers[i] = nil;
  }
  NSUInteger generation = ++_generation;
  const bool restoreSnapshot = !_field;
  __weak MarisWindLayer *weak = self;
  dispatch_async(_loader, ^{
    MarisWindLayer *owner = weak;
    if (!owner || generation != owner->_generation)
      return;
    BOOL complete = NO;
    @try {
    maris::SnapshotStore store(owner->_snapshotPath.UTF8String);
    auto snapshot = restoreSnapshot ? store.load(p) : maris::Snapshot{};
    if (snapshot.field) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (generation != owner->_generation || owner->_field) return;
        owner->_field = snapshot.field;
        owner->_dataSavedAt = snapshot.savedAt;
        if (owner.dataStatus) owner.dataStatus(YES, snapshot.savedAt, YES);
        [owner setNeedsDisplay];
      });
      snapshot.field.reset();
    }
    NSData *catalog =
        [owner fetch:@"https://beta.yr-maps.met.no/api/wind/available.json"];
    BOOL staleCatalog = NO;
    if (catalog) {
    } else {
      catalog = [NSData dataWithContentsOfFile:owner->_catalogPath];
      staleCatalog = catalog != nil;
    }
    if (!catalog) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (generation == owner->_generation && owner.dataStatus)
          owner.dataStatus(YES, owner->_dataSavedAt, NO);
      });
      return;
    }
    NSDictionary *json = [NSJSONSerialization JSONObjectWithData:catalog
                                                         options:0
                                                           error:nil];
    NSArray *times = json[@"times"];
    if (!times.count) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (generation == owner->_generation && owner.dataStatus)
          owner.dataStatus(YES, owner->_dataSavedAt, NO);
      });
      return;
    }
    NSString *url = times[0][@"tiles"][@"png"];
    if (!url) {
      dispatch_async(dispatch_get_main_queue(), ^{
        if (generation == owner->_generation && owner.dataStatus)
          owner.dataStatus(YES, owner->_dataSavedAt, NO);
      });
      return;
    }
    if (!staleCatalog)
      [catalog writeToFile:owner->_catalogPath atomically:YES];
    auto field = std::make_shared<maris::Field>(p);
    BOOL requestFailed = NO;
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
          if (requestFailed) continue;
          // A persisted catalog still contains valid immutable tile URLs.
          // Allow missing tiles to load if connectivity returned meanwhile.
          NSData *data = [owner fetch:tile];
          if (!data) {
            requestFailed = YES;
            continue;
          }
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
    if (generation != owner->_generation) return;
    complete = !staleCatalog && field->complete();
    const double savedAt = NSDate.date.timeIntervalSince1970;
    std::string catalogText((const char *)catalog.bytes, catalog.length);
    store.save(*field, catalogText, int64_t(savedAt));
    dispatch_async(dispatch_get_main_queue(), ^{
      if (generation != owner->_generation)
        return;
      if (!maris::canPublish(owner->_field.get(), *field)) {
        if (owner.dataStatus) owner.dataStatus(YES, owner->_dataSavedAt, NO);
        return; // Never replace a visible field with a partial refresh.
      }
      if (owner->_field && owner->_field->plan.key() == field->plan.key() && owner->_field->rgba == field->rgba) {
        owner->_dataSavedAt = savedAt;
        if (owner.dataStatus) owner.dataStatus(staleCatalog, savedAt, NO);
        return;
      }
      owner->_oldField = owner->_field;
      owner->_fieldTransition = maris::WindFade();
      owner->_field = field;
      owner->_dataSavedAt = savedAt;
      if (owner.dataStatus) owner.dataStatus(staleCatalog || field->received != (p.right-p.left+1)*(p.bottom-p.top+1), savedAt, NO);
      NSLog(@"[Wind] atlas %dx%d tiles=%d load=%.2fs", p.width(), p.height(),
            field->received, CACurrentMediaTime() - now);
      [owner setNeedsDisplay];
    });
    } @finally {
      const BOOL succeeded = complete;
      dispatch_async(dispatch_get_main_queue(), ^{
        if (generation != owner->_generation) return;
        owner->_loading = NO;
        // Failed/partial loads must retry even if the camera never moves.
        owner->_nextLoadAt = CACurrentMediaTime() + (succeeded ? 60 : 5);
      });
    }
  });
  */
}
- (void)drawInMapView:(MLNMapView *)map
          withContext:(MLNStyleLayerDrawingContext)context {
  if (!_field || !self.renderEncoder)
    return;
  _stats.begin();
  auto f = _field;
  float progress = _oldField ? _fieldTransition.update(true, CACurrentMediaTime()) : 1;
  if (progress >= 1) _oldField.reset();
  const double *matrix = &context.projectionMatrix.m00;
  id<MTLRenderCommandEncoder> encoder = self.renderEncoder;
  [encoder setCullMode:MTLCullModeNone];
  [encoder setDepthStencilState:_depth];
  float fade = _fade.update(_windVisible, CACurrentMediaTime());
  double now = CACurrentMediaTime(), delta = _previous ? now - _previous : 0,
         dt = std::min(.05, delta);
  _previous = now;
  _quality.frame(delta);
  const auto &lines = _particles.update(*f, matrix, context.zoomLevel, dt,
                                        _density * _quality.density, _animationSpeed, _oldField.get(), progress);
  if (!lines.empty() && _trails) {
    float particleOpacity = _particleOpacity * fade;
    [encoder setFragmentBytes:&particleOpacity length:sizeof(particleOpacity) atIndex:0];
    CGSize size = map.backendResource.mtkView.drawableSize;
    maris::buildTrailMesh(lines, size.width, size.height, _trailMesh);
    if (_trailMesh.empty()) return;
    // Metal setVertexBytes is limited to 4 KiB; stream through a native buffer.
    int slot = -1;
    for (int i = 0; i < 3; ++i) {
      bool available = false;
      if ((*_busy)[i].compare_exchange_strong(available, true)) { slot = i; break; }
    }
    // Never block the renderer or allocate an unbounded queue of GPU buffers.
    if (slot < 0) return;
    NSUInteger bytes = _trailMesh.size() * sizeof(maris::ClipVertex);
    if (!_buffers[slot] || _buffers[slot].length < bytes)
      _buffers[slot] = [_device newBufferWithLength:bytes options:MTLResourceStorageModeShared];
    id<MTLBuffer> buffer = _buffers[slot];
    if (!buffer) { (*_busy)[slot].store(false); return; }
    memcpy(buffer.contents, _trailMesh.data(), bytes);
    auto busy = _busy;
    [map.backendResource.commandBuffer addCompletedHandler:^(id<MTLCommandBuffer> command) { (*busy)[slot].store(false); }];
    [encoder setRenderPipelineState:_trails];
    [encoder setVertexBuffer:buffer offset:0 atIndex:0];
    [encoder drawPrimitives:MTLPrimitiveTypeTriangle
                vertexStart:0
                vertexCount:_trailMesh.size()];
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
- (int)resolutionPenalty { return _quality.zoomPenalty(); }
- (BOOL)fadeFinished { return !_field || _fade.value <= 0; }
- (int)maximumDimension { return _quality.maxDimension(); }
- (void)willMoveFromMapView:(MLNMapView *)map {
  ++_generation;
  [self cancelActiveRequest];
  _key = nil;
  _oldField.reset();
  _field.reset();
  _trails = nil;
  _depth = nil;
  _previous = 0;
  _fade = maris::WindFade();
  _particles = maris::Particles();
  std::vector<maris::ClipVertex>().swap(_trailMesh);
  for (int i = 0; i < 3; ++i) _buffers[i] = nil;
  [_session getAllTasksWithCompletionHandler:^(NSArray<NSURLSessionTask *> *tasks) { for (NSURLSessionTask *task in tasks) [task cancel]; }];
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
@property (nonatomic, copy) RCTDirectEventBlock onDataStatus;
@property (nonatomic, copy) RCTDirectEventBlock onCenterWind;
@property (nonatomic, copy) NSArray<NSNumber *> *sampleCoordinate;
@property (nonatomic, copy) NSDictionary *windField;
- (void)emitSample;
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
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(background) name:UIApplicationDidEnterBackgroundNotification object:nil];
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(foreground) name:UIApplicationDidBecomeActiveNotification object:nil];
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(memoryWarning) name:UIApplicationDidReceiveMemoryWarningNotification object:nil];
  }
  return self;
}
- (void)background {
  _clock.paused = YES;
  if (_layer.style) [_layer.style removeLayer:_layer];
  _layer = nil;
  tileCache.clear();
}
- (void)foreground { _clock.paused = NO; }
- (void)memoryWarning { [self background]; [self foreground]; }
- (void)dealloc { [NSNotificationCenter.defaultCenter removeObserver:self]; [_clock invalidate]; }
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
- (void)setSampleCoordinate:(NSArray<NSNumber *> *)coordinate {
  _sampleCoordinate = [coordinate copy];
  [self emitSample];
}
- (void)setWindField:(NSDictionary *)windField {
  _windField = [windField copy];
  [_layer setGfsField:_windField];
  [self emitSample];
}
- (void)setEnabled:(BOOL)enabled {
  if (enabled && !_enabled) [_layer resetRequests];
  _enabled = enabled;
}
- (void)emitSample {
  if (_sampleCoordinate.count != 2 || !_onCenterWind) return;
  double speed = _layer ? [_layer speedAtCenter:CLLocationCoordinate2DMake(
      _sampleCoordinate[1].doubleValue, _sampleCoordinate[0].doubleValue)] : -1;
  _onCenterWind(@{@"speed": speed < 0 ? (id)NSNull.null : @(speed), @"coordinate": _sampleCoordinate});
}
- (void)tick:(CADisplayLink *)clock {
  if (UIApplication.sharedApplication.applicationState != UIApplicationStateActive) {
    // Control Center temporarily makes iOS inactive (e.g. toggling Wi-Fi).
    // Keep the displayed field. Actual background cleanup is handled by the
    // UIApplicationDidEnterBackground notification, not by focus loss.
    return;
  }
  if (!_enabled) {
    _layer.windVisible = NO;
    if ([_layer fadeFinished]) {
      if (_layer.style) [_layer.style removeLayer:_layer];
      _layer = nil;
    } else {
      [_layer setNeedsDisplay];
    }
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
    [_map.style addLayer:_layer];
  } else if (_map.style.layers.lastObject != _layer) {
    [_map.style removeLayer:_layer];
    [_map.style addLayer:_layer];
  }
  _layer.particleOpacity = _opacity;
  _layer.windVisible = YES;
  [_layer setGfsField:_windField];
  _layer.density = _density;
  _layer.animationSpeed = _animationSpeed;
  __weak MarisWindControl *weak = self;
  _layer.dataStatus = ^(BOOL stale, double savedAt, BOOL loading) {
    MarisWindControl *owner = weak;
    [owner emitSample]; // New/restored atlas: retry the last requested destination.
    if (owner.onDataStatus) owner.onDataStatus(@{@"stale": @(stale), @"savedAt": @(savedAt * 1000), @"loading": @(loading)});
  };
  // The mobile GFS client supplies the resident field. Native rendering does
  // not fetch weather data or reload a second wind source.
  // Includes static fields (density=0), which also need fade frames.
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
RCT_EXPORT_VIEW_PROPERTY(onDataStatus, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(onCenterWind, RCTDirectEventBlock)
RCT_EXPORT_VIEW_PROPERTY(sampleCoordinate, NSArray)
RCT_EXPORT_VIEW_PROPERTY(windField, NSDictionary)
@end
