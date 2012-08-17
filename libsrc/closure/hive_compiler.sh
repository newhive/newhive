./bin/build/closurebuilder.py \
  -n goog.editor.SeamlessField \
  -n goog.editor.plugins.BasicTextFormatter \
  -n goog.dom \
  -n goog.editor.plugins.RemoveFormatting \
  -n goog.editor.plugins.UndoRedo \
  --root=. \
  -o compiled \
  -c compiler.jar \
  > closure.compiled.js

./bin/build/closurebuilder.py \
  -n goog.editor.SeamlessField \
  -n goog.editor.plugins.BasicTextFormatter \
  -n goog.dom \
  -n goog.editor.plugins.RemoveFormatting \
  -n goog.editor.plugins.UndoRedo \
  --root=. \
  -o script \
  -c compiler.jar \
  > closure.concatenated.js
