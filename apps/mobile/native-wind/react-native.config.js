module.exports = {
  dependency: {
    platforms: {
      ios: { podspecPath: './MarisWind.podspec' },
      android: {
        sourceDir: './android',
        packageImportPath: 'import com.maris.wind.MarisWindPackage;',
        packageInstance: 'new MarisWindPackage()',
      },
    },
  },
};
