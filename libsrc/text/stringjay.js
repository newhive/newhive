// stringjay.js
// Copyright 2013, Abram Clark & A Reflection Of LLC
// License to be determined, probably some sort of open source

// A Turing incomplete for the template writer,
// Turing complete for the template renderer,
// [theoretically] safe, compiling template engine
// with built-in support for outputting AMD modules
// with companion curl loader plugin.
// Also [hopefully] has reasonable error reporting; it throws
// parse-time and render-time exceptions with template line numbers.
//
// Usage:
//     Templatify {<if foo }your templates{>} with {stringjay_template|e} like syntax.
//
//     In templates there are bare strings, and tags. Inside tags, there are
//     Stringjay words. Stringjay words are either a JSON primitive or a path that
//     resolves to a property of the context passed to the compiled template.
//
//     Basically there are three kinds of tags:
//         Block function tags: {<foo_block_fn arg1 arg2 ... }moar template goodness{>} --
//             this calls foo_block_fn(block_fn, arg1, arg2, ...), and inserts its return value
//                 block_fn(context_object) returns the rendered text of the enclosed block
//                 The template context is available in foo_block_fn as `this`
//         Regular function call tag: {foo arg1 arg2 ...}, {foo|bar|baz}, or {|foo} --
//             calls foo(arg1, arg2, ...), baz(bar(foo)), or foo() and inserts return value
//                 The template context is available in foo as `this`
//             Note the apply syntax can be mixed with blocks, like {<foo|e}stuff{>} to escape the output of foo
//         Variable insert tag: {foo}, {/foo/bar}, or {../foo}, etc -- inserts value of path
//
// (There should be a reasonable code example in the curl loader plugin)

// not bothering to support other module contexts for now
// (function(global){
// 	"use strict";

// 	var o, stringjay = o = {
// 		// ...

// 	if (typeof module !== 'undefined' && module.exports) {
// 		module.exports = o;
// 	} else if (typeof define === 'function' && define.amd) {
// 		define(['module'], function(m){ module = m; return o; });
// 	} else {
// 		// if module context not recognized, polute global namespace
// 		global.stringjay = o;
// 	}

define(['util', 'module'], function(u, module){
	"use strict";

	var o = {
		version: '1.0.0',
		base_context: {},
		template_text: /^[^{]+/,
		tag_open: /^{/,
		tag_close: /^\s*}/,
		strip_whitespace: false // not yet implemented
	};

	// parse :: String -> AST Object Array, throws ParseError String
	// possible AST node type:
	//     'literal' -- JS string or number
	//     'function' (possibly with block)
	//     'path' -- string that references item in context
	// (little complex, but straihgtforward)
	function parse(template){
		var line = 0, character = 0 /* character not yet used */;

		return block();

		// parse bare template string and push it into ast
		function block(){
			var ast = [], parsed;

			while(parsed = template_text() || tag()){
				ast.push(parsed);
				if(!template) break; // end of template
			}
			return ast;
		}

		function template_text(){
			var matched = match(o.template_text);
			if(!matched) return false;
			return {
				type: 'literal',
				line: line,
				value: matched
			};
		}

		// parse variable insertion, literal, or function (with potential nested block arg)
		function tag(){
			var node = false, block_node = false, deeper;

			match(o.tag_open, true, 'tag open');
			space();
			if(match(/^>/)){
				match(o.tag_close, true, 'tag close');
				return false;
			}
			else if(match(/^</)){
				// start block tag
				node = func();
				block_node = node;
			}
			else if(deeper = expr(node)) node = deeper;
			else throw error('unexpected tag content');

			match(o.tag_close, true, 'tag close');
			if(block_node) node.block = block();
			return node;
		}

		function expr(node){
			var parsed, new_node;
			if(parsed = match(/^\s*\|/, false)){
				new_node = func();
				if(node) new_node.arguments.unshift(node);
			}
			else if(new_node = path(false)){
				new_node.arguments = args();
				new_node.type = new_node.arguments.length ? 'function' : 'path';
			}
			else if(new_node = json());
			else return false;
			var deeper = expr(new_node);
			return deeper ? deeper : new_node;
		}

		function func(){
			var node = path(true);
			node.type = 'function';
			node.arguments = args();
			return node;
		}

		function space(){ match(/^\s*/); }

		// TODO: grouping with parenthesis
		function args(){
			var args = [], arg;
			while(arg = json() || path()) args.push(arg);
			return args;
		}

		// 'foo/..' not supported, because it's pointless. '..'s must be at beginning
		function path(do_throw){
			var matched = match(/^\s*[\/\w!.]+/i, do_throw, 'path');
			if(!matched) return false;
			var  node = {
				type: 'path',
				line: line,
				up_levels: 0
			};
			if(node.absolute = matched[0] == '/') matched = matched.slice(1);
			var value = matched.split(/\//);
			while(value[0] == '..'){
				value.shift();
				node.up_levels++;
			}
			node.value = value.concat(value.pop().split('.')) // optional foo.bar syntax
				.map(function(v){ return v.trim() });
			return node;
		}

		// parse JSON literal (string or number)
		function json(){
			var parsed;
			if(parsed = match(/^\s*-?[\d.E]+/i)); // match number
			else if(parsed = match(/^\s*"/)){ // match string
				while(1){
					parsed += match(/(\\.)|"/, true, 'string close');
					if(parsed.charAt(parsed.length-1) == '"') break;
				}	
			}
			else return false;
			return {
				type: 'literal',
				json: true,
				line: line,
				value: JSON.parse(parsed)
			}
		}

		// whenever called with do_throw = true, pattern_name should also be given
		function match(pattern, do_throw, pattern_name){
			var m = template.match(pattern);
			if(!m){
				if(do_throw) throw error(pattern_name + ', ' + String(pattern) + ', not found');
				else return false;
			}
			// return empty or successfully eaten string
			var i = m.index + m[0].length,
			    eaten = template.slice(0, i), breaks = eaten.match(/\n/g);
			if(breaks) line += breaks.length;
			template = template.slice(i);
			return eaten;
		}

		function error(msg){ return 'ParseError on line ' + line + ': ' + msg +
			' at ' + JSON.stringify(template.match(/^.*(\n|$)/)[0]); }
	}
	o._parse = parse; // for debugging / curiosity

	// compile :: AST Object -> JS String
	// TODO: finish
	function compile(node){
		if(node.constructor == Array)
			return node.map(compile).join('+');
		else if(node.type == 'literal')
			return JSON.stringify(node.value);
		else if(node.type == 'path')
			return compile_path();
		else if(node.type == 'function')
			return compile_path() + '(' +
				node.arguments.map(JSON.stringify).join(',') + ')';

		function compile_path(){
			return 'r(' + [ node.value, node.absolute, node.up_levels ]
				.map(JSON.stringify).join(',') + ')';
		}
	}

	function render(context_0, node){
		var context = [ u.copy(o.base_context, u.copy(context_0)) ];
		return render_node(context, node);
	}
	o._render = render; // for debugging / curiosity

	function render_node(context, node){
		if(node.constructor == Array)
			return node.map(function(n){ return render_node(context, n) })
				.reduce(u.op['+'], '');
		else if(node.type == 'literal')
			return node.value;
		else if(node.type == 'path')
			return resolve(context, node.value, node.absolute, node.up_levels);
		else if(node.type == 'function'){
			var fn = resolve(context, node.value, node.absolute, node.up_levels),
				args = [context];
			if(!fn) return ''; // maybe eliminate this silent failure
			if(node.block) args.push(function(context){
				return render_node(context, node.block) });
			args = args.concat( node.arguments.map(function(n){
				return render_node(context, n) }) );
			return fn.apply(null, args);
		}
		else throw 'Unrecognized node: ' + JSON.stringify(node);
	}

	o.template = function(template){
		var ast = parse(template);
		return function(data){ return render(data, ast); }
	};

	// TODO: finish
	o.compile = function(){ return compile(o2.ast); };

	// TODO: finish
	o.compile_amd = function(){
		return "define(['" + module.id + "'], function(sj){" + compile(o2.ast) + '});';
	};

	function resolve(context, path, absolute, up_levels){
		var value = absolute ? context[0] : context[context.length - 1 - up_levels];
		for(var i = 0; i < path.length; i++) {
			if(typeof value == 'undefined') return '';
			else value = value[path[i]];
		}
		return value ? value : '';
	}
	o.resolve = resolve;

	function encode_to_html(context, str) {
		var encodeHTMLRules = { "&": "&#38;", "<": "&#60;", ">": "&#62;", '"': '&#34;', "'": '&#39;', "/": '&#47;' },
			matchHTML = /&(?!#?\w+;)|<|>|"|'|\//g;
		return str.replace(matchHTML, function(m) {
			return encodeHTMLRules[m] || m;
		});
	};

	o.base_context['true'] = true;
	o.base_context['false'] = false;
	o.base_context['null'] = null;
	o.base_context['if'] = function(context, block, condition){
		if(condition) return block(context);
	};
	// necessary without () grouping, because NOTing an argument isn't possible
	o.base_context['unless'] = function(context, block, condition){
		if(!condition) return block(context);
	};
	o.base_context['for'] = function(context, block, iteratee){
		return iteratee.map(function(v){ return block(context.concat(v)) })
			.reduce(u.op['+'], '');
	};
	o.base_context.e = encode_to_html;

	return o;
});