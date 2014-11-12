#ifndef __WEB_TILE_H__
#define __WEB_TILE_H__

#include "application.h"
#include "../common/sdl/gl_texture_surface.h"

// A "WebTile" is essentially a WebView assigned to an OpenGL texture.
struct WebTile {
  Awesomium::WebView* webView;
  bool isTransparent;

  WebTile(int width, int height);
  WebTile(Awesomium::WebView* existingWebView, int width, int height);
  ~WebTile();

  const GLTextureSurface* surface();

  void resize(int width, int height);
  void toggleTransparency();
};

#endif
