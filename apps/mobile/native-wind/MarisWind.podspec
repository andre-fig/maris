Pod::Spec.new do |s|
  s.name = 'MarisWind'
  s.version = '0.1.0'
  s.summary = 'Native MapLibre wind field renderer'
  s.homepage = 'https://github.com/andre-fig/maris'
  s.license = { :type => 'MIT' }
  s.author = 'Maris'
  s.source = { :git => 'https://github.com/andre-fig/maris.git' }
  s.platform = :ios, '16.4'
  s.source_files = 'ios/*.{h,mm}', 'cpp/*.{hpp,cpp}'
  s.exclude_files = 'cpp/*.test.cpp'
  s.frameworks = 'Metal', 'MetalKit', 'ImageIO'
  s.dependency 'React-Core'
  s.dependency 'MapLibreReactNative'
  s.pod_target_xcconfig = {
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) MLN_RENDER_BACKEND_METAL=1',
    'FRAMEWORK_SEARCH_PATHS' => '$(inherited) "$(PODS_CONFIGURATION_BUILD_DIR)/MapLibreReactNative"'
  }
end
