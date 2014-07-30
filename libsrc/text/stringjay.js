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

define(['browser/js', 'module'],
	function(util, module)
{
	"use strict";

	var o = {
		version: '1.0.0',
		template_text: /^((?!([{]|```)).|\s)+/,
		begin_quote: /^```/,
		quoted: /.*?```/,
		tag_open: /^{/,
		tag_close: /^\s*}/,
		strip_whitespace: false // not yet implemented
	}, context_base = {};
	var suffix = new Array('', 'K', 'M', 'G');

	// parse :: String -> AST Object Array, throws ParseError String
	// possible AST node type:
	//     'literal' -- JS string or number
	//     'function' (possibly with block)
	//     'path' -- string that references item in context
	// (little complex, but straightforward)
	function parse(template){
		// Why are line numbers 1-based?
		var line = 1, character = 1; // character not yet used

		return block(null);

		// parse bare template string and push it into ast
		function block(parent){
			var ast = [], parsed;
			var prev_node = null, next_node = null

			while(parsed = ( quote() || template_text() || tag() )) {
				ast.push(parsed);
				parsed.parent = parent;
				if (prev_node) prev_node.next_node = parsed;
				parsed.prev_node = prev_node;
				prev_node = parsed;
				if(!template) break; // end of template
			}
			if (parsed) parsed.next_node = null
			return ast;
		}

		function quote(){
			var matched = match(o.begin_quote);
			if(!matched) return false;
			return {
				type: 'literal',
				line: line,
				value: match(o.quoted, true, 'literal').slice(0, -3)
			};
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
			var node = false, block_node = false, deeper, matched;

			match(o.tag_open, true, 'tag open');
			space();
			if(match(/^>/)){
				match(o.tag_close, true, 'tag close');
				return false;
			} else if(match(/^</)){
				// start block tag
				node = func();
				block_node = node;
			} else if(match(/^#/)) return {
				type: 'comment',
				line: line,
				value: match(/.*#}/, true, 'comment').slice(0, -2)
			};
			else if(deeper = expr(node)) {
				deeper.parent = node;
				deeper.next_node = deeper.prev_node = null;
				node = deeper;
			} else throw parse_error('unexpected tag content');

			match(o.tag_close, true, 'tag close');
			if(block_node) node.block = block(node);
			return node;
		}

		function expr(node){
			var parsed, new_node;
			if(parsed = match(/^\s*\|/, false)){
				new_node = func();
				if(node) new_node.arguments.push(node);
			}
			else if(new_node = path(false)){
				new_node.arguments = args();
				new_node.type = new_node.arguments.length ? 'function' : 'path';
			}
			else if(new_node = json());
			else return false;
			var deeper = expr(new_node);
			if(deeper){
				deeper.parent = new_node;
				deeper.next_node = deeper.prev_node = null;
				new_node = deeper;
			}
			return new_node;
		}

		function func(){
			var node = path(true);
			node.type = 'function';
			node.arguments = args();
			return node;
		}

		function space(){ match(/^\s*/); }

		function args(){
			var args = [], arg;
			while(arg = json() || path() || grouping()) args.push(arg);
			return args;
		}

		function grouping(){
			if(!match(/^\s*\(/)) return false;
			var grouped = expr();
			match(/^\s*\)/, true);
			return grouped;
		}

		// 'foo/..' not supported, because it's pointless ('..'s must be at beginning)
		function path(do_throw){
			// paths must not match JS literals
			var matched = match(/^\s*[\/.]*([_a-z][\/\w.]*)?/i, do_throw, 'path');
			if(!matched.trim()) return false;
			var node = {
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
			node.value = value.concat(value.pop().split('.')). // optional foo.bar syntax
				map(function(v){ return v.trim() }).
				filter(function(v){ return v });
			return node;
		}

		// parse JSON literal (string or number)
		function json(){
			var parsed;
			if(parsed = match(/^\s*-?[\d][\d.E]*/i)); // match number
			else if(parsed = match(/^\s*"/)){ // match string
				while(1){
					var str = /(\\.)|(")/;
					var matched = template.match(str);
					parsed += match(/(\\.)|"/, true, 'string close');
					if(matched[2]) break;
				}	
			}
			// implement by iteratively passing more shit to JSON.parse
			// else if(parsed = match( // match list literal
			// else if(parsed = match( // match object literal
			else return false;
			try { return {
				type: 'literal',
				json: true,
				line: line,
				value: JSON.parse(parsed)
			} }
			catch(e){ throw parse_error(e.message); }
		}

		// whenever called with do_throw = true, pattern_name should also be given
		function match(pattern, do_throw, pattern_name){
			var m = template.match(pattern);
			if(!m){
				if(do_throw) {
					throw parse_error(pattern_name + ', ' +
					String(pattern) + ', not found');
				}
				else return false;
			}
			// return empty or successfully eaten string
			var i = m.index + m[0].length,
			    eaten = template.slice(0, i), breaks = eaten.match(/\n/g);
			if(breaks) line += breaks.length;
			template = template.slice(i);
			return eaten;
		}

		function parse_error(msg){ return 'Parse error on line ' + line + ': ' + msg +
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

	function get_template(context) {
		return context[2].template;
	}
	function current_node(context) {
		return get_template(context).current_node
	}
	function prev_if_node(node) {
		var if_node = null
		while (node = node.prev_node) {
			if (is_if_node(node)) {
				if_node = node;
				break;
			}
		}
		return if_node;
	}
	function is_if_node(node) {
		if (node.type != "function" || node.value.length != 1)
			return false;
		return (node.value[0] == "if" || node.value[0] == "unless"
			 || node.value[0] == "contains" || node.value[0] == "elif");
	}

	function render_function(context, node) {
		var fn = resolve(context, node.value, node.absolute, node.up_levels),
			args = [context];
		if(typeof fn != 'function')
			throw o.render_error('Not a function: ' + path_to_string(node),
				context, node);
		if(node.block)
			args.push(function(context){
				return render_node(context, node.block) });
		args = args.concat( node.arguments.map(function(n){
			return render_node(context, n) }) );
		get_template(context).current_node = node;
		var result = fn.apply(null, args);
		// Save the result of the function call. Actually just save whether there 
		// WAS a result ('true') or not ('')
		node.result = (result == '') ? '' : 'true';
		return result;
	}

	function render_node(context, node){
		get_template(context).current_node = node;
		if(node.constructor == Array)
			return node.map(function(n){ return render_node(context, n) })
				.reduce(util.op['+'], '');
		else if(node.type == 'literal') {
			if (typeof(node.value) == "string") {
				var str = node.value.replace(/^\s*\n\s*/, "");
				str = str.replace(/\s*\n\s*$/, "");
				return str;
			}
			return node.value;
		}
		else if(node.type == 'path')
			return resolve(context, node.value, node.absolute, node.up_levels);
		else if(node.type == 'function')
			return render_function(context, node, false);
		else if(node.type == 'comment') return '';
		else throw o.render_error('unrecognized node: ' + JSON.stringify(node),
			context, node);
	}

	o.render_error = function(msg, context, node){
		return ('Render error in template ' +
			get_template(context).template_name +
			', line ' + node.line + ': ' + msg);
	};

	o.template = function(template_src, name, user_context){
		if(!user_context) user_context = {}
		if(!name) name = 'anonymous'
		var ast = parse(template_src);
		function template(data){
			if(!data) data = {};
			data.template = template;
			var stack = [ context_base, user_context, data ];
			return resolve(stack, ['after_render'], false, 0)(
				render_node(stack, ast) );
		}
		template.ast = ast;
		template.render_node = ast;
		template.template_apply = function(stack){
			return render_node(stack, ast);
		};
		template.template_name = name

		// add template_apply to context for rendering from within a template
		set_reference(user_context, name, template.template_apply);

		return template;
	};

	function set_reference(obj, name, val){
		var path = name.replace(/\//g, '.').split('.'), prop_name, prop;
		while(prop_name = path.shift()){
			prop = obj[prop_name];
			if(!path.length) obj[prop_name] = val;
			else if(typeof(prop) != 'object') prop = obj[prop_name] = {};
			obj = prop;
		}
		obj = val;
	}

	// TODO: finish
	o.compile = function(){ return compile(o2.ast); };

	// TODO: finish
	// o.compile_amd = function(){
	// 	return "define(['" + module.id + "'], function(sj){" + compile(o2.ast) + '});';
	// };

	function resolve(context, path, absolute, up_levels){
		var level = absolute ? 0 : context.length - 1 - up_levels, value;
		// traverse to parent scope, looking for first path part
		if(path[0])
			while(level >= 0 && typeof value == 'undefined')
				value = context[level--][path[0]];
		else return context[level];
		// descend into data with the rest of path parts
		for(var i = 1; i < path.length; i++){
			if(typeof value == 'undefined') return '';
			value = value[path[i]];
		}
		return typeof value == 'undefined' ? '' : value;
	}
	o.resolve = resolve;

	function path_to_string(path){
		return ( // careful with semicolon insertion
			( path.absolute ? '/' :
				(new Array(path.up_levels + 1)).join('../') ) +
			path.value.join('/')
		);
	}

	function encode_to_html(context, str) {
		var encodeHTMLRules = { "&": "&#38;", "<": "&#60;", ">": "&#62;", '"': '&#34;', "'": '&#39;', "/": '&#47;' },
			matchHTML = /&(?!#?\w+;)|<|>|"|'|\//g;
		return str.replace(matchHTML, function(m) {
			return encodeHTMLRules[m] || m;
		});
	};

	context_base.after_render = function(a){ return a };
	context_base['true'] = true;
	context_base['false'] = false;
	context_base['null'] = null;
	context_base['if'] = function(context, block, condition, equals){
		var node = current_node(context)
		if(typeof equals != 'undefined') condition = (condition == equals);
		var result = (condition ? block(context) : '');
		node.if_result = condition ? true : false;
		return result;
	};

	context_base['else'] = function(context, block){
		return context_base['elif'](context, block, true)
	};
	context_base['elif'] = function(context, block, condition){
		var node = current_node(context)
			,if_node = prev_if_node(node)
		 	,if_result = !if_node || if_node.if_result
			,result = ''
		node.if_result = if_result
		if (!if_result && condition) {
			result = block(context);
			node.if_result = true;
		}
		// if (!if_node) warn("No matching if");
		return result;
	};
	// necessary without () grouping, because NOTing an argument isn't possible
	context_base['unless'] = function(context, block, condition, equals){
		if(typeof equals != 'undefined') condition = (condition == equals);
		// return condition ? '' : block(context);
		return context_base['if'](context, block, !condition)
	};
	context_base['for'] = function(context, block, iteratee, var_name){
		if(!iteratee || (iteratee.constructor != Array &&
			typeof(iteratee) != "object")) return '';
		var res = ""
		$.each(iteratee, function(i, v) {
			// If iterating through literals, the value of the literal
			// is passed in the context as the variable "item"
			if(typeof(v) != "object") {
				v = {item: v};
			}
			if(var_name) 
				v[var_name] = i;
			else if(iteratee.constructor != Array)
				v['key'] = i;
			res += block(context.concat(v));
		});
		return res;
	};
	context_base['range'] = function(context, block, var_name, start, stop, step){
		if(typeof stop == 'undefined'){
			stop = start;
			start = 0;
		}
		if(typeof step == 'undefined') step = 1;
		var out = '';
		for(var i = start; i < stop; i += step){
			var loop_context = {};
			loop_context[var_name] = i;
			out += block(context.concat(loop_context));
		}
		return out;
	};
	context_base['sparsefor'] = function(context, block, iteratee, modulous, selector){
		if(!iteratee || iteratee.constructor != Array) return '';
		return iteratee.map(function(v, i){
			return (i % modulous == selector) ? block(context.concat(v)) : '';
		}).reduce(util.op['+'], '');
	};
	// With pushes a new, top context with "what" as its contents.
	// Takes optional varargs key-value pairs which are also pushed onto context.
	context_base['with'] = function(context, block, what){
		var new_context = $.extend({}, what);
		// All arguments after what are name value pairs
		for(var i = 3; i < arguments.length; i += 2){
			new_context[arguments[i]] = arguments[i + 1];
		}
		return block(context.concat(new_context));
	};
	context_base['debug'] = function(context, do_debugger){
		if(typeof do_debugger == "undefined") do_debugger = true;
		//if(do_debugger) debugger;
        //     throw o.render_error('debug break', context,
		  	   // current_node(context));
		// possibly add rendering context in invisible div
		return '<div>DEBUG inserted</div><div style="display:none">' + '' + '</div>';
	};
	context_base.e = encode_to_html;
	// TODO-cleanup-object: add object builder, that takes key value
	//   association list this will be used for query parameters and whatnot
	context_base.json = function(context, data){
		return JSON.stringify(data);
	};
	context_base.strip_slash = function(context, str){
		return str.replace(/^\/\//, '')
	};
	// TODO: write as accumulate
	// {set "k" (concat "you " "are " "awesome")}
	context_base.concat = function(context){
		var res = "";
		for(var i = 1; i < arguments.length; ++i){
			if (typeof(arguments[i]) == "string")
				res += arguments[i];
		}
		return res;
	};
	// Set lhs to the value of rhs
	// ex: {set "my_var" 3}
	context_base.set = function(context, lhs, rhs){
		context[context.length - 1][lhs] = rhs;
		return '';
	};
	context_base.get = function(context, obj, key){
		return obj[key];
	};
	context_base.len = function(context, obj){
		return obj.length;
	};
	context_base.and = function(context){
		// special case: (and) returns true. 
		if (arguments.length == 1)
			return true;
		for(var i = 1; i < arguments.length - 1; ++i){
			if (!arguments[i])
				return arguments[i];
		}
		return arguments[i];
	};
	context_base.or = function(context){
		// special case: (or) returns true. (or false) and (or true... false true) are false.
		if (arguments.length == 1)
			return true;
		for(var i = 1; i < arguments.length - 1; ++i){
			if (arguments[i])
				return arguments[i];
		}
		return arguments[i];
	};
	context_base.not = function(context, arg){
		return ! arg;
	};
	context_base.eq = function(context, lhs, rhs){
		return lhs == rhs;
	};
	context_base.neq = function(context, lhs, rhs){
		return lhs != rhs;
	};
	context_base.contains = function(context, list, item){
		var contains = (list.lastIndexOf(item) >= 0);
		return contains;
	};
	context_base.cond = function(context, cond, truthy, falsy){
		return cond ? truthy : falsy;
	};
	context_base.lower = function(context, s){ return s.toLowerCase(); };
	// TODO-cleanup: add example cases to all these functions.
	// {<for (unique user.activity)}<item>{>}
	context_base.unique = function(context, l){
		var field = false;
		if (arguments.length >= 3)
			field = arguments[2];
		if (!l.reduce)
			return [];
		return l.reduce(function(p, c) {
			if (field) {
	        	if (!p.filter(function(e) {return e[field]==c[field];}
	        		).length) p.push(c);
	        }
	        else if (p.indexOf(c) < 0)
	        	p.push(c);
	        return p;
    	}, []);
	};
	// {reverse [1,2,3]} ==> [3,2,1]
	// {reverse "not_a_list"} ==> []
	// {<for (reverse user.activity)}<item>{>}
	context_base.reverse = function(context, l){
		if (!l.reverse)
			return [];
		return l.concat().reverse(); 
	};

	// TODO: write as accumulate
	// {set "k" (plus 2 2 2)}
	context_base.plus = function(context){
		var sum = 0;
		for(var i = 1; i < arguments.length; ++i){
			if (typeof(arguments[i]) == "number")
				sum += arguments[i];
		}
		return sum;
	};
	// {mod 6 3}  {mod "verbatim"}
	context_base.mod = function(context, x, y){ 
		if (typeof(x) == "number" && typeof(y) == "number")
			return x % y;
		return x;
	};
	context_base.thousands = function(context, n){ 
		for (var i = 0; Math.abs(n) >= 1000 && i < suffix.length - 1; ++i) {
			if (Math.abs(n) < 10000)
				n = Math.round(n/100)/10;
			else
				n = Math.round(n/1000);
		}
		return n + suffix[i];
	};
	context_base.string_to_list = function (context, string){
	  	var array = string.split("[^\w']+");
	  	if ( array.length <= 1 ) return string;
		else return array;
	};

	return o;
});
