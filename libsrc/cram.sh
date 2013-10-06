#!/bin/sh
cram build/site -o compiled.site.js -r .. -m build/external_jquery
cram build/expr -o compiled.expr.js -r .. -m build/external_jquery
