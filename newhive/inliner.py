import cssutils #sudo pip install cssutils
from lxml import etree, html #sudo apt-get install python-lxml


ignore_list = ['html', 'head', 'title', 'meta', 'link', 'script']


def inline_styles(document, css_string='', css_path=''):
    if not (css_string or css_path): raise ValueError
    if hasattr(document, 'readline'):
        document = html.parse(document).getroot()
    else:
        document = html.fromstring(document)

    if css_path:
        css = cssutils.parseFile(css_path)
    elif css_string:
        css = cssutils.parseString(css_string)

    return _inline_styles(document, css)

def inline_styles_from_strings(document, css):
    document = html.fromstring(document)
    css = cssutils.parseString(css)
    return _inline_styles(document, css)

def inline_styles_from_files(document, css):
    document = html.parse(document).getroot()
    css = cssutils.parseFile(css)
    return _inline_styles(document, css)

def _inline_styles(document, css):
    elms = {} # stores all inlined elements.
    for rule in css:
        if hasattr(rule, 'selectorText'):
            for element in document.cssselect(rule.selectorText):
                if element not in elms:
                    elms[element] = cssutils.css.CSSStyleDeclaration()
                    inline_styles = element.get('style')
                    if inline_styles:
                        for p in cssutils.css.CSSStyleDeclaration(cssText=inline_styles):
                            elms[element].setProperty(p)

                for p in rule.style:
                    elms[element].setProperty(p.name, p.value, p.priority)

    # Set inline style attributes unless the element is not worth styling.
    for element, style in elms.iteritems():
        if element.tag not in ignore_list:
            element.set('style', style.getCssText(separator=u''))

    return etree.tostring(document, method="xml", pretty_print=True)
