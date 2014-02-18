/**
 * phaser <https://github.com/jonschlinkert/phaser>
 * The most deadly markdown documentation generator in the Alpha Quadrant.
 *
 * Copyright (c) 2014 Jon Schlinkert, Brian Woodward, contributors.
 * Licensed under the MIT license.
 */

'use strict';

var fs = require('fs');
var path = require("path");
var file = require('fs-utils');
var configFile = require('config-file');
var cwd = require('cwd');
var _ = require('lodash');

/**
 * phaser
 */

var phaser = module.exports = {};

phaser.cwd        = cwd;
phaser.base       = cwd;
phaser.file       = _.defaults(require('./lib/file'), file);
phaser.data       = require('./lib/data');
phaser.matter     = require('./lib/matter');
phaser.plugins    = require('./lib/plugins');
phaser.partials   = require('./lib/partials');
phaser.filters    = require('./lib/filters');
phaser.tags       = require('./lib/tags');
phaser.template   = require('./lib/template');
phaser.exclusions = require('./lib/exclusions');
phaser.utils      = require('./lib/utils/index');
phaser.extensions = {};
phaser.ext        = '.md';


/**
 * runtime config
 */

if(file.exists('.phaserrc')) {
  phaser.phaserrc =  configFile.load('.phaserrc');
} else if(file.exists('.phaserrc.yml')) {
  phaser.phaserrc = configFile.load('.phaserrc.yml');
} else {
  phaser.phaserrc = {};
}


/**
 * phaser.init
 */

phaser.init = function (options) {
  if (phaser.initalized) {
    return;
  }
  phaser.initalized = true;
  var opts = _.extend({verbose: false}, options);

  // Initialize mixins
  _.fn = require('./lib/mixins.js');
  _.mixin(_.fn);

  // Initalize logging
  phaser.log = require('./lib/log').init(opts, phaser);
  phaser.verbose = phaser.log.verbose;
};


/**
 * phaser.process
 */

phaser.process = function(src, options) {
  var opts = _.extend({toc: {maxDepth: 2}}, options);
  phaser.init(opts);

  // Add runtime config
  var runtimeConfig;
  if(opts.phaserrc) {
    runtimeConfig = configFile.load(cwd(opts.phaserrc));
  } else {
    runtimeConfig = phaser.phaserrc;
  }
  _.extend(opts, runtimeConfig);

  phaser.options = opts;

  phaser.config = require('./lib/config').init(opts.config);
  phaser.context = _.extend({}, phaser.config);
  delete phaser.context.config;

  src = src || '';

  // Extend `phaser`
  phaser.layout = require('./lib/layout')(phaser);

  // Build up the context
  _.extend(phaser.context, opts);
  _.extend(phaser.context, opts.metadata || {});
  _.extend(phaser.context, require('./lib/data').init(opts));

  // Template settings
  var settings = _.defaults({}, opts.settings);

  // Initialize plugins
  _.extend(phaser.context, phaser.plugins.init(phaser));

  // Initialize Lo-Dash tags and filters
  _.extend(phaser.context, phaser.tags.init(phaser));
  _.extend(phaser.context, phaser.filters.init(phaser));

  // Initalize partials
  _.extend(phaser.context, phaser.partials.init(phaser));

  // Initialize `options.data`
  _.extend(phaser.context, phaser.data.init(opts));

  // Extract and parse front matter
  phaser.page  = phaser.matter.init(src, opts);
  _.extend(phaser.context, phaser.page.context);

  // Exclusion patterns, to omit certain options from context
  phaser.context = phaser.exclusions(phaser.context, opts);

  // Process templates and render content
  var renderDone = false;
  var rendered = phaser.template(phaser.page.content, phaser.context, settings);

  phaser.tags.resolve(phaser, rendered, function (err, results) {
    rendered = results;
    renderDone = true;
  });

  while (!renderDone) {
    process.nextTick();
  }
  var result = phaser.utils.postProcess(rendered, opts);

  // Generate a TOC from <!-- toc --> after all content is included.
  result = require('marked-toc').insert(result, opts.toc);

  return {
    context: phaser.context,
    content: result,
    original: src
  };
};


// Read a file, then process with Phaser
phaser.read = function(src, options) {
  var opts = _.extend({}, options);
  phaser.init(opts);

  var content = file.readFileSync(src);
  return phaser.process(content, opts).content;
};

// Read a file, process it with Phaser, then write it.
phaser.copy = function(src, dest, options) {
  var opts = _.extend({}, options);

  phaser.init(opts);
  phaser.options = phaser.options || {};
  phaser.options.dest = dest || phaser.cwd();

  file.writeFileSync(dest, phaser.read(src, opts));
  phaser.log.success('Saved to:', dest);
};

// Expand filepaths
phaser.expandMapping = function(src, dest, options) {
  var opts = _.extend({concat: false}, options);
  phaser.init(opts);

  dest = dest || phaser.cwd();
  phaser.options = phaser.options || {};
  phaser.options.dest = phaser.cwd(dest) || phaser.cwd();

  var defaults = {
    cwd: opts.cwd || phaser.cwd('docs'),
    ext: phaser.ext || opts.ext,
    destBase: dest
  };

  var concat = opts.concat || file.hasExt(dest) || false;
  var defer = [];
  var count = 0;

  file.expandMapping(src, defaults).map(function(fp) {
    fp.src.filter(function(filepath) {
      if (!file.exists(filepath)) {
        phaser.log.error('>> Source file "' + filepath + '" not found.');
        return false;
      } else {
        return true;
      }
    }).map(function(filepath) {
      phaser.options.src = filepath;
      if(!concat) {
        count++;
        file.writeFileSync(fp.dest, phaser.read(filepath, opts));
        phaser.log.success('Saved to', fp.dest);
      } else {
        count = 1;
        defer.push(filepath);
      }
    });
  });

  if(concat) {
    var blob = defer.map(function(filepath) {
      return phaser.read(filepath, opts);
    }).join('\n');
    file.writeFileSync(dest, blob);
    phaser.log.success('Saved to', dest);
  }

  if(count > 1) {
    phaser.log.success(count, 'files generated.');
  }

  if(count === 0) {
    phaser.log.error('\nFailed.');
  }
};