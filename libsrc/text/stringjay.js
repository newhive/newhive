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

(function(global){
	"use strict";

	var o, Stringjay = o = {
		version: '1.0.0',
		base_context: {},
		template_text: /^[^{]*/, // Must match empty string!
		tag_open: /^{/,
		tag_close: /^\s*}/,
		strip_whitespace: false // not yet implemented
	};

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = o;
	} else if (typeof define === 'function' && define.amd) {
		define(function(){ return o; });
	} else {
		// in unrecognized module context, polute global namespace
		global.Stringjay = o;
	}

	// parse :: String -> AST Object Array, throws ParseError String
	// possible AST node type:
	//     'literal' -- JS string or number
	//     'function' (possibly with block)
	//     'path' -- string that references item in context
	// (little complex, but straihgtforward)
	function parse(template){
		var ast = [], line = 0, character = 0 /* character not yet used */;

		return block();

		// parse bare template string and push it into ast
		function block(){
			var ast = [], parsed;

			while(parsed = match(o.template_text, true, 'template text')){
				ast.push({
					type: 'literal',
					line: line,
					value: parsed
				});
				var node;
				if(template) node = tag();
				if(node) ast.push(node);
				else break;
			}
			return ast;
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

			match(o.tag_close, true, 'tag close');
			if(block_node) node.arguments.unshift(block());
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

		function path(do_throw){
			var matched = match(/^\s*[\/\w!.]*/i, do_throw, 'path');
			if(!matched) return false;
			var  node = {
				type: 'path',
				line: line,
				up_levels: 0
			};
			if(matched[0] == '/'){
				node.absolute = true;
				matched = matched.slice(1);
			}
			var value = matched.split(/\//);
			while(value[0] == '..'){
				value.shift();
				node.up_levels++;
			}
			node.value = value.concat(value.pop().split('.')); // optional foo.bar syntax
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
				line: line,
				value: JSON.parse(parsed)
			}
		}

		// whenever called with do_throw = true, pattern_name should also be given
		function match(pattern, do_throw, pattern_name){
			var m = template.match(pattern);
			if(!m){
				if(do_throw)
					throw 'ParseError on line ' + line + ': ' + pattern_name +
						', ' + String(pattern) + ', not found at ' +
						JSON.stringify(template.match(/^.*(\n|$)/)[0]) + ' :-[';
				else return false;
			}
			// return empty or successfully eaten string
			var i = m.index + m[0].length,
			    eaten = template.slice(0, i), breaks = eaten.match(/\n/g);
			if(breaks) line += breaks.length;
			template = template.slice(i);
			return eaten;
		}
	}
	o._parse = parse; // expose for debugging and/or curiosity

	// compile :: AST Object Array -> JS String
	function compile(ast){
		return "";
	}

	// compile_path :: Path String -> JS String
	// takes a path string like "foo.bar" or "/../../baz" or JavaScript literal
	// returns JS code string that evaluates to the value given a context in 'this'
	function compile_path(str){
	};

	// Stringjay.compile :: Template String -> JS Function String
	o.compile = function(template){
		var ast = parse(template_str);
		return compile(ast);
	};

	// Stringjay.compile_amd :: Template String -> JS AMD String
	o.compile_amd = function(template){
		var ast = parse(template_str);
		return compile(ast);
	};

	function encode_to_html(str) {
		var encodeHTMLRules = { "&": "&#38;", "<": "&#60;", ">": "&#62;", '"': '&#34;', "'": '&#39;', "/": '&#47;' },
			matchHTML = /&(?!#?\w+;)|<|>|"|'|\//g;
		return str.replace(matchHTML, function(m) {
			return encodeHTMLRules[m] || m;
		});
	};

	o.base_context['true'] = true;
	o.base_context['false'] = false;
	o.base_context['null'] = null;
	o.base_context['if'] = function(block, condition){

	};
	// necessary without () grouping, because NOTing an argument isn't possible
	o.base_context['unless'] = function(block, condition){

	};
	o.base_context['for'] = function(block, iteratee){

	};

	o.base_context.e = encode_to_html;
})(window || global);

// <h1>{owner.fullname}'s profile</h1>
// <h1>about:</h1>
// <p>{about|e}</p>
// {<if user.logged_in}
//   <div><a href='/msg/{owner.name}'>
//     send {owner.fullname} a message
//   </a></div>
// {>}
// {<for cards}
//   {|/templates/expr_card}
// {>}
// you can have your braces too :-{"}"}