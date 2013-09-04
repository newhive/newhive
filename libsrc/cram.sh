#!/bin/sh
cram app/site -o compiled.site.js -r .. -m app/external_jquery
cram app/expr -o compiled.expr.js -r ..
