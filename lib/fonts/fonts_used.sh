#grep ttf ../libsrc/base.css | perl -pe "s/.*'\/lib\/fonts\/(.*?.ttf)'.*/\1/;"
#cat ../base.css | grep url | perl -pe 's/\)/)\n/g' | grep 'lib/fonts' | perl -pe 's/.*\/lib\/fonts\/(.[^?#")]*?)/\1/' > fonts_used
