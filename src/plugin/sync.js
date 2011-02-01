/**
 *
 * sync plugin
 *
 * Specify syncLoading:true in the curl configuration to load this module and
 * allow server-side commonjs sync-loading require statements. e.g.:
 *
 * var sModule = require('my/strings');
 *
 * (c) copyright 2011, unscriptable.com
 *
 */

/*
 * like the debug plugin, this is loaded before any other modules (except for
 * possibly the debug plugin). it provides a sync xhr-and-eval loader that
 * is invoked whenever the commonjs sync require statements are encountered.
 *
 */
