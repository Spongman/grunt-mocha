/*
 * grunt
 * https://github.com/cowboy/grunt
 *
 * Copyright (c) 2012 "Cowboy" Ben Alman
 * Licensed under the MIT license.
 * http://benalman.com/about/license/
 *
 * Mocha task
 * Copyright (c) 2012 Kelly Miyashiro
 * Licensed under the MIT license.
 * http://benalman.com/about/license/
 */

'use strict';

// Nodejs libs.
var _             = require('lodash');
var util          = require('util');
var path          = require('path');
var reporters     = require('mocha').reporters;
// Helpers
var helpers       = require('../support/mocha-helpers');

var runner = require('mocha-headless-chrome');

module.exports = function(grunt) {
  var reporter;

  // Growl is optional
  var growl;
  try {
    growl = require('growl');
  } catch(e) {
    growl = function(){};
    grunt.verbose.write('Growl not found, \'npm install growl\' for Growl support');
  }

  // Get an asset file, local to the root of the project.
  var asset = path.join.bind(null, __dirname, '..');

  // ==========================================================================
  // TASKS
  // ==========================================================================

  grunt.registerMultiTask('mocha', 'Run Mocha unit tests in a headless PhantomJS instance.', function() {

    var dest = this.data.dest;
    // Merge task-specific and/or target-specific options with these defaults.
    var options = this.options({
      // Output console.log calls
      log: false,
      // Mocha reporter
      reporter: 'spec',
      // Default PhantomJS timeout.
      timeout: 5000,      
      // Explicit non-file URLs to test.
      urls: [],
      // Fail with grunt.warn on first test failure
      bail: false,
      // Log script errors as grunt errors
      logErrors: false,
      // Growl notification when tests pass.
      growlOnSuccess: true,
      // Run tests, set to false if you would rather call `mocha.run` yourself
      // due to async loading of your assets.
      run: true,
      reporterOptions: { output: dest },
    });


    // Output console messages if log == true
    if (options.log) {
      // phantomjs.removeAllListeners(['console']);
      // phantomjs.on('console', grunt.log.writeln);
    } else {
      // phantomjs.off('console', grunt.log.writeln);
    }

    // Output errors on script errors
    if (options.logErrors) {
      // phantomjs.on('error.*', function(error, stack) {
      //   var formattedStack = _.map(stack, function(frame) {
      //     return "    at " + (frame.function ? frame.function : "undefined") + " (" + frame.file + ":" + frame.line + ")";
      //   }).join("\n");
      //   grunt.fail.warn(error + "\n" + formattedStack, 3);
      // });
    }

    var optsStr = JSON.stringify(options, null, '  ');
    grunt.verbose.writeln('Options: ' + optsStr);

    // Clean Phantomjs options to prevent any conflicts
    // var PhantomjsOptions = _.omit(options, 'reporter', 'urls', 'log', 'bail');

    // var phantomOptsStr = JSON.stringify(PhantomjsOptions, null, '  ');
    // grunt.verbose.writeln('Phantom options: ' + phantomOptsStr);

    // Combine any specified URLs with src files.
    var urls = options.urls.concat(this.filesSrc).filter(url => url);

    // Remember all stats from all tests
    var testStats = [];

    // This task is asynchronous.
    var done = this.async();

    // Hijack console.log to capture reporter output
    var output = [];
    var consoleLog = console.log;

    // Only hijack if we really need to
    // Some "good" reporters like XUnit accept an `output` option
    // and we pass `dest` there but there's no good way to detect
    // if a reporter supports this so stub out console.log just in case.
    if (dest) {
      if (grunt.file.isFile(dest)) {
        grunt.file.delete(dest);
      }
      console.log = function() {
        consoleLog.apply(console, arguments);
        output.push(util.format.apply(util, arguments));
      };
    }

    // Process each filepath in-order.
    grunt.util.async.forEachSeries(urls, function(url, next) {
      grunt.log.writeln('Testing: ' + url);

      // create a new mocha runner façade
      // var runner = new EventEmitter();
      // phantomjsEventManager.add(url, runner);

      const runnerOptions = {
        file: url,                           // test page path
        reporter: options.reporter,                             // mocha reporter name
        width: 800,                                  // viewport width
        height: 600,                                 // viewport height
        timeout: 120000,                             // timeout in ms
        //executablePath: '/usr/bin/chrome-unstable',  // chrome executable path        
        visible: false,                               // show chrome window
        args: ['no-sandbox','disable-web-security']                         // chrome arguments
      };
      
      runner(runnerOptions)
        .then(result => {
            let json = JSON.stringify(result);
            testStats.push(result.result.stats);
            grunt.log.subhead("test done");
            grunt.verbose.writeln(json);
            next()
        })
        .catch(err => {
          if(options.bail){
            grunt.fail.warn(err);
          } else {
            grunt.log.error(err);
          }
          next();
        });
      

      // // Set Mocha reporter
      // var Reporter = null;
      // if (reporters[options.reporter]) {
      //   Reporter = reporters[options.reporter];
      // } else {
      //   // Resolve external reporter module
      //   var externalReporter;
      //   try {
      //     externalReporter = require.resolve(options.reporter);
      //   } catch (e) {
      //     // Resolve to local path
      //     externalReporter = path.resolve(options.reporter);
      //   }

      //   if (externalReporter) {
      //     try {
      //       Reporter = require(externalReporter);
      //     }
      //     catch (e) { }
      //   }
      // }
      // if (Reporter === null) {
      //   grunt.fatal('Specified reporter is unknown or unresolvable: ' + options.reporter);
      // }
      // reporter = new Reporter(runner, options);      
    },

    // All tests have been run.
    function() {
      if (dest) {
        // Restore console.log to original and write the output
        console.log = consoleLog;

        if (!grunt.file.exists(dest)) {
            // Write only if our reporter ignored our `output` option
            grunt.file.write(dest, output.join('\n'));
        }
      }
      var stats = helpers.reduceStats(testStats);

      if (stats.failures === 0) {
        var okMsg = stats.tests + ' passed!' + ' (' + stats.duration + 's)';

        if (options.growlOnSuccess) {
          growl(okMsg, {
            image: asset('growl/ok.png'),
            title: okMsg,
            priority: 3
          });
        }

        grunt.log.ok(okMsg);

        // Async test pass
        done(true);

      } else {
        var failMsg = stats.failures + '/' + stats.tests + ' tests failed (' +
          stats.duration + 's)';

        // Show Growl notice, if avail
        growl(failMsg, {
          image: asset('growl/error.png'),
          title: failMsg,
          priority: 3
        });

        // Bail tests if bail option is true
        if (options.bail) {
          grunt.warn(failMsg);
        } else {
          grunt.log.error(failMsg);
        }

        // Async test fail
        done(false);
      }
    });
  });
};
