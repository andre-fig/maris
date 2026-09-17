module.exports = {
  dependency: {
    platforms: {
      ios: null,
      android: {
        sourceDir: "./android",
        packageImportPath: "import com.maris.offline.MarisOfflinePackage;",
        packageInstance: "new MarisOfflinePackage()",
      },
    },
  },
};
