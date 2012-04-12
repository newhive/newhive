grep ttf ../../libsrc/base.css | perl -pe "s/.*'\/lib\/fonts\/(.*?.ttf)'.*/\1/;" | xargs du -shc
