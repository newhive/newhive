from webassets.filter import Filter
import scss
css = scss.Scss()

class ScssFilter(Filter):
  name='pyScss'

  def output(self, _in, out, **kwargs):
    out.write(css.compile(_in.read()))

  def input(self, _in, out, **kwargs):
    out.write(css.compile(_in.read()))
