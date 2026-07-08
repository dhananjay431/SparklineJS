const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
  // Entry point — the main library file
  entry: "./sparkline.js",

  mode: "production",

  output: {
    // Output minified file as sparkline.min.js
    filename: "sparkline.min.js",
    path: path.resolve(__dirname, "dist"),
    // UMD-compatible library output
    library: {
      name: "Sparkline",
      type: "umd",
    },
    globalObject: "this",
    clean: true,
  },

  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          // Compress: drop comments, console, unused code
          compress: {
            drop_console: false,
            dead_code: true,
            unused: true,
          },
          // Mangle variable names for smaller output
          mangle: true,
          // Format: single-line output
          format: {
            comments: false,
          },
        },
        // Also extract a .map file
        extractComments: false,
      }),
    ],
  },

  // No external dependencies
  externals: [],
};
