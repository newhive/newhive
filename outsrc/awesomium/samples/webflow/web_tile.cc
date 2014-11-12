#include "web_tile.h"
#include "../common/sdl/gl_texture_surface.h"
#include <Awesomium/STLHelpers.h>

#if TRANSPARENT
#define TEX_FORMAT	GL_RGBA
#else
#define TEX_FORMAT	GL_RGB
#endif

using namespace Awesomium;

WebTile::WebTile(int width, int height) : isTransparent(false) {
  webView = Awesomium::WebCore::instance()->CreateWebView(width, height);
}

WebTile::WebTile(Awesomium::WebView* existingWebView, int width, int height) : webView(existingWebView), isTransparent(false) {
}

WebTile::~WebTile() {
  webView->Destroy();
}

const GLTextureSurface* WebTile::surface() {
  const Awesomium::Surface* surface = webView->surface();
  if (surface)
    return static_cast<const GLTextureSurface*>(surface);
  
  return 0;
}

void WebTile::resize(int width, int height) {
  webView->Resize(width, height);
}

void WebTile::toggleTransparency() {
  webView->ExecuteJavascript(WSLit("document.body.style.backgroundColor = 'transparent'"), WSLit(""));
  webView->SetTransparent(isTransparent = !isTransparent);
}
