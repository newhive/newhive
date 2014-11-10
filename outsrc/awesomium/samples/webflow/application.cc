#include "application.h"
#include "../common/sdl/gl_texture_surface.h"
#include <Awesomium/STLHelpers.h>
#include "web_tile.h"
#include <math.h>
#include <cmath>
#include <iostream>
#include <fstream>
#include <string>
#include "SDL_syswm.h"

// The vertices of our 3D quad
const GLfloat GVertices[] = {
  -1.0f, -1.0f, 0.0f,
  1.0f, -1.0f, 0.0f,
  -1.0f,  1.0f, 0.0f,
  1.0f,  1.0f, 0.0f,
};

// The UV texture coordinates of our 3D quad
const GLshort GTextures[] = {
  0, 1,
  1, 1,
  0, 0,
  1, 0,
};

using namespace Awesomium;

Application::Application() : 
  shouldQuit(false),
  isAnimating(false),
  isDragging(false),
  isActiveWebTileFocused(false),
  offset(0),
  zoomStart(-1),
  numTiles(0),
  activeWebTile(-1),
  webCore(0) {
  int sdlError = SDL_Init(SDL_INIT_EVERYTHING);

  if (sdlError == -1) {
    shouldQuit = true;
    return;
  }

  const SDL_VideoInfo* info = SDL_GetVideoInfo();
  WIDTH = static_cast<int>(info->current_w * 0.7);
  HEIGHT = static_cast<int>(info->current_h * 0.7);

  if (WIDTH > 1440)
    WIDTH = 1440;
  if (HEIGHT > 1050)
    HEIGHT = 1050;

  SDL_Init(SDL_INIT_VIDEO);
  SDL_WM_SetCaption("Awesomium v1.7 - WebFlow Sample","");
  SDL_GL_SetAttribute(SDL_GL_DOUBLEBUFFER, 1);
  SDL_GL_SetAttribute(SDL_GL_SWAP_CONTROL, 1);
  SDL_SetVideoMode(WIDTH, HEIGHT, 0, SDL_OPENGL);
  SDL_EnableUNICODE(1);

  gluOrtho2D(0, WIDTH, 0, HEIGHT);
  glEnable(GL_TEXTURE_2D);

  Awesomium::WebConfig conf;
  conf.log_level = kLogLevel_Verbose;

  webCore = Awesomium::WebCore::Initialize(conf);
  webCore->set_surface_factory(new GLTextureSurfaceFactory());

  addWebTileWithURL("http://www.awesomium.com/webflow/1.7/", WIDTH, HEIGHT);
  addWebTileWithURL("http://www.google.com", WIDTH, HEIGHT);
  addWebTileWithURL("http://www.awesomium.com", WIDTH, HEIGHT);
  addWebTileWithURL("http://www.flickr.com/explore/interesting/7days/", WIDTH, HEIGHT);

  // Set our first WebTile as active
  activeWebTile = 0;
  webTiles[0]->webView->Focus();
  double curTime = SDL_GetTicks() / 1000.0;
  zoomDirection = true;
  zoomStart = curTime;
  zoomEnd = curTime + ZOOMTIME;
}

Application::~Application() {
  for (size_t i = 0; i < webTiles.size(); i++)
    delete webTiles[i];

  if (webCore)
    webCore->Shutdown();

  SDL_Quit();
}

void Application::addWebTileWithURL(const std::string& url, int width,
                                    int height) {
  WebTile* tile = new WebTile(width, height);

#if defined(__WIN32__) || defined(_WIN32)
  SDL_SysWMinfo wmi;
  SDL_VERSION(&wmi.version);

  if(SDL_GetWMInfo(&wmi))
    tile->webView->set_parent_window(wmi.window);
#endif

  Awesomium::WebURL webUrl(ToWebString(url));
  tile->webView->LoadURL(webUrl);
  tile->webView->set_view_listener(this);
  tile->webView->set_load_listener(this);
  tile->webView->set_process_listener(this);

  webTiles.push_back(tile);
}

void Application::update() {
  handleInput();
  webCore->Update();
  updateWebTiles();

  if (isAnimating)
    driveAnimation();

  draw();

  SDL_Delay(0);
}

void Application::draw() {
  double curTime = SDL_GetTicks() / 1000.0;
  double zoom = 0;

  if (zoomStart > 0) {
    if (curTime < zoomEnd) {
      zoom = (curTime - zoomStart) / (zoomEnd - zoomStart);

      if (!zoomDirection)
        zoom = 1.0 - zoom;
    } else {
      zoomStart = -1;
      zoomEnd = 0;

      isActiveWebTileFocused = zoomDirection;
    }
  }

  if (isActiveWebTileFocused) {
    const GLTextureSurface* surface = webTiles[activeWebTile]->surface();

    if (surface) {
      int tileWidth = surface->width();
      int tileHeight = surface->height();

      gluOrtho2D(0, WIDTH, 0, HEIGHT);
      glClear(GL_COLOR_BUFFER_BIT);
      glMatrixMode(GL_PROJECTION);
      glLoadIdentity();
      glScalef(1,1,1);
      glBindTexture(GL_TEXTURE_2D, surface->GetTexture());
      glColor4f(1,1,1,1);
      glBegin(GL_QUADS);
      glTexCoord2f(0,1);
      glVertex3f(0, 0, 0.0f);
      glTexCoord2f(1,1);
      glVertex3f((GLfloat)tileWidth, 0, 0.0f);
      glTexCoord2f(1,0);
      glVertex3f((GLfloat)tileWidth, (GLfloat)tileHeight, 0.0f);
      glTexCoord2f(0,0);
      glVertex3f(0, (GLfloat)tileHeight, 0.0f);
      glEnd();
      SDL_GL_SwapBuffers();
    }
  } else {
    glViewport(0,0,WIDTH,HEIGHT);
    glDisable(GL_DEPTH_TEST);
    glDisable(GL_CULL_FACE);
    glClearColor(0,0,0,0);
    glVertexPointer(3,GL_FLOAT,0,GVertices);
    glEnableClientState(GL_VERTEX_ARRAY);
    glTexCoordPointer(2, GL_SHORT, 0, GTextures);
    glEnableClientState(GL_TEXTURE_COORD_ARRAY);
    glColorPointer(4, GL_FLOAT, 0, customColor);
    glEnableClientState(GL_COLOR_ARRAY);
    glEnable(GL_TEXTURE_2D);
#if TRANSPARENT
    glEnable (GL_BLEND);
    glBlendFunc (GL_ONE, GL_ONE_MINUS_SRC_ALPHA);
#endif
    glClear(GL_COLOR_BUFFER_BIT);
    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();
    glScalef(1,1,1);
    glTranslatef(0, 0, 0.5);
    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();

    int i, len = webTiles.size();
    int mid = (int)floor(offset + 0.5);
    int iStartPos = mid - webTiles.size();

    if (iStartPos < 0)
      iStartPos = 0;

    for (i = iStartPos; i < mid; ++i)
      drawTile(i, i-offset, 0);

    int iEndPos = mid + webTiles.size();

    if (iEndPos >= len)
      iEndPos = len - 1;

    for (i = iEndPos; i > mid; --i)
      drawTile(i, i - offset, 0);

    drawTile(mid, mid - offset, zoom);

    SDL_GL_SwapBuffers();
  }
}

void Application::drawTile(int index, double off, double zoom) {
  const GLTextureSurface* surface = webTiles[index]->surface();

  if (!surface)
    return;

  GLfloat m[16];
  memset(m,0,sizeof(m));
  m[10] = 1;
  m[15] = 1;
  m[0] = 1;
  m[5] = 1;

  double trans = off * SPREADIMAGE;
  double f = off * FLANKSPREAD;

  if (f < -FLANKSPREAD)
    f = -FLANKSPREAD;

  else if (f > FLANKSPREAD)
    f = FLANKSPREAD;

  m[3] = -f;
  m[0] = 1-fabs(f);

  double sc = 0.45 * (1 - fabs(f));
  sc = (1 - zoom) * sc + 1 * zoom;

  trans += f * 1.1;

  for (int i = 0; i < 16; i++)
    customColor[i] = 1.0;

  if (f >= 0) {
    customColor[0] = customColor[1] = customColor[2] = 1 -
                                      (f / FLANKSPREAD);
    customColor[8] = customColor[9] = customColor[10] = 1 -
                                      (f / FLANKSPREAD);
  } else {
    customColor[4] = customColor[5] = customColor[6] = 1 -
                                      (-f / FLANKSPREAD);
    customColor[12] = customColor[13] = customColor[14] = 1 -
                                        (-f / FLANKSPREAD);
  }

  glPushMatrix();
  glBindTexture(GL_TEXTURE_2D, surface->GetTexture());
  glTranslatef(trans, 0, 0);
  glScalef(sc, sc, 1);
  glMultMatrixf(m);
  glColorPointer(4, GL_FLOAT, 0, customColor);
  glDrawArrays(GL_TRIANGLE_STRIP,0,4);

  // Draw reflection:

  glTranslatef(0,-2,0);
  glScalef(1,-1,1);

  for (int i = 0; i < 16; i += 4) {
    customColor[i] = 0.25;
    customColor[i + 1] = 0.25;
    customColor[i + 2] = 0.25;
  }

  if (f >= 0) {
    customColor[0] = customColor[1] = customColor[2] =
                                        (1- (f / FLANKSPREAD)) / 5.0 + 0.05;

  } else {
    customColor[4] = customColor[5] = customColor[6] =
                                        (1-(-f / FLANKSPREAD)) / 5.0 + 0.05;

  }

  customColor[8] = customColor[9] = customColor[10] = 0;
  customColor[12] = customColor[13] = customColor[14] = 0;

  glDrawArrays(GL_TRIANGLE_STRIP,0,4);

  glPopMatrix();
}

void Application::updateAnimationAtTime(double elapsed) {
  int max = webTiles.size() - 1;

  if (elapsed > runDelta)
    elapsed = runDelta;

  double delta = fabs(startSpeed) * elapsed - FRICTION * elapsed *
                 elapsed / 2;

  if (startSpeed < 0)
    delta = -delta;

  offset = startOff + delta;

  if (offset > max)
    offset = max;

  if (offset < 0)
    offset = 0;
}

void Application::endAnimation() {
  if (isAnimating) {
    int max = webTiles.size() - 1;
    offset = floor(offset + 0.5);

    if (offset > max)
      offset = max;

    if (offset < 0)
      offset = 0;

    isAnimating = false;
  }
}

void Application::driveAnimation() {
  double elapsed = SDL_GetTicks() / 1000.0 - startTime;

  if (elapsed >= runDelta)
    endAnimation();
  else
    updateAnimationAtTime(elapsed);
}

void Application::startAnimation(double speed) {
  if (isAnimating)
    endAnimation();

  // Adjust speed to make this land on an even location
  double delta = speed * speed / (FRICTION * 2);
  if (speed < 0)
    delta = -delta;

  double nearest = startOff + delta;
  nearest = floor(nearest + 0.5);
  startSpeed = sqrt(fabs(nearest - startOff) * FRICTION * 2);

  if (nearest < startOff)
    startSpeed = -startSpeed;

  runDelta = fabs(startSpeed / FRICTION);
  startTime = SDL_GetTicks() / 1000.0;

  isAnimating = true;

  int lastActiveWebTile = activeWebTile;

  activeWebTile = (int)nearest;

  if (activeWebTile >= (int)webTiles.size())
    activeWebTile = webTiles.size() - 1;
  else if (activeWebTile < 0)
    activeWebTile = 0;

  if (activeWebTile != lastActiveWebTile) {
    webTiles[lastActiveWebTile]->webView->Unfocus();
    webTiles[lastActiveWebTile]->webView->PauseRendering();
    webTiles[activeWebTile]->webView->Focus();
    webTiles[activeWebTile]->webView->ResumeRendering();
  }
}

void Application::animateTo(int index) {
  if (index == offset)
    return;

  if (isActiveWebTileFocused) {
    double curTime = SDL_GetTicks() / 1000.0;
    zoomDirection = false;
    zoomStart = curTime;
    zoomEnd = curTime + ZOOMTIME;
    isActiveWebTileFocused = false;
  }

  startOff = offset;
  offset = index;

  int dist = (int)offset - (int)startOff;

  double speed = sqrt(abs(dist) * 2 * FRICTION);

  if (dist < 0)
    speed = -speed;

  startAnimation(speed);
}

void Application::updateWebTiles() {
// nothing
}

int getWebKeyFromSDLKey(SDLKey key);

void handleSDLKeyEvent(Awesomium::WebView* webView, const SDL_Event& event) {
  if (!(event.type == SDL_KEYDOWN || event.type == SDL_KEYUP))
    return;

  Awesomium::WebKeyboardEvent keyEvent;

  keyEvent.type = event.type == SDL_KEYDOWN?
                  Awesomium::WebKeyboardEvent::kTypeKeyDown :
                  Awesomium::WebKeyboardEvent::kTypeKeyUp;

  char* buf = new char[20];
  keyEvent.virtual_key_code = getWebKeyFromSDLKey(event.key.keysym.sym);
  Awesomium::GetKeyIdentifierFromVirtualKeyCode(keyEvent.virtual_key_code,
      &buf);
  strcpy(keyEvent.key_identifier, buf);
  delete[] buf;

  keyEvent.modifiers = 0;

  if (event.key.keysym.mod & KMOD_LALT || event.key.keysym.mod & KMOD_RALT)
    keyEvent.modifiers |= Awesomium::WebKeyboardEvent::kModAltKey;
  if (event.key.keysym.mod & KMOD_LCTRL || event.key.keysym.mod & KMOD_RCTRL)
    keyEvent.modifiers |= Awesomium::WebKeyboardEvent::kModControlKey;
  if (event.key.keysym.mod & KMOD_LMETA || event.key.keysym.mod & KMOD_RMETA)
    keyEvent.modifiers |= Awesomium::WebKeyboardEvent::kModMetaKey;
  if (event.key.keysym.mod & KMOD_LSHIFT || event.key.keysym.mod & KMOD_RSHIFT)
    keyEvent.modifiers |= Awesomium::WebKeyboardEvent::kModShiftKey;
  if (event.key.keysym.mod & KMOD_NUM)
    keyEvent.modifiers |= Awesomium::WebKeyboardEvent::kModIsKeypad;

  keyEvent.native_key_code = event.key.keysym.scancode;

  if (event.type == SDL_KEYUP) {
    webView->InjectKeyboardEvent(keyEvent);
  } else {
    unsigned int chr;
    if ((event.key.keysym.unicode & 0xFF80) == 0)
      chr = event.key.keysym.unicode & 0x7F;
    else
      chr = event.key.keysym.unicode;

    keyEvent.text[0] = chr;
    keyEvent.unmodified_text[0] = chr;

    webView->InjectKeyboardEvent(keyEvent);

    if (chr) {
      keyEvent.type = Awesomium::WebKeyboardEvent::kTypeChar;
      keyEvent.virtual_key_code = chr;
      keyEvent.native_key_code = chr;
      webView->InjectKeyboardEvent(keyEvent);
    }
  }
}

void Application::handleInput() {
  SDL_Event event;

  while (SDL_PollEvent(&event)) {
    switch (event.type) {
    case SDL_QUIT:
      shouldQuit = true;
      return;
    case SDL_MOUSEMOTION:
      if (isActiveWebTileFocused)
        webTiles[activeWebTile]->webView->
        InjectMouseMove(event.motion.x, event.motion.y);

      if (isDragging)
        handleDragMove(event.motion.x, event.motion.y);
      break;
    case SDL_MOUSEBUTTONDOWN:
      if (isActiveWebTileFocused) {
        if (event.button.button == SDL_BUTTON_LEFT)
          webTiles[activeWebTile]->webView->
          InjectMouseDown(Awesomium::kMouseButton_Left);
        else if (event.button.button == SDL_BUTTON_WHEELUP)
          webTiles[activeWebTile]->webView->InjectMouseWheel(25, 0);
        else if (event.button.button == SDL_BUTTON_WHEELDOWN)
          webTiles[activeWebTile]->webView->InjectMouseWheel(-25, 0);
      } else {
        if (event.button.button == SDL_BUTTON_LEFT)
          handleDragBegin(event.button.x, event.button.y);

        if (event.button.button == SDL_BUTTON_WHEELUP)
          webTiles[activeWebTile]->webView->InjectMouseWheel(25, 0);
        else if (event.button.button == SDL_BUTTON_WHEELDOWN)
          webTiles[activeWebTile]->webView->InjectMouseWheel(-25, 0);
      }
      break;
    case SDL_MOUSEBUTTONUP:
      if (isActiveWebTileFocused) {
        if (event.button.button == SDL_BUTTON_LEFT)
          webTiles[activeWebTile]->webView->
          InjectMouseUp(Awesomium::kMouseButton_Left);
      } else {
        if (event.button.button == SDL_BUTTON_LEFT)
          handleDragEnd(event.button.x, event.button.y);
      }
      break;
    case SDL_KEYDOWN: {
      if (event.key.keysym.sym == SDLK_ESCAPE) {
        shouldQuit = true;
        return;
      } else if (event.key.keysym.sym == SDLK_BACKQUOTE) {
        if (zoomStart > 0)
          return;

        if (isActiveWebTileFocused) {
          double curTime = SDL_GetTicks() / 1000.0;
          zoomDirection = false;
          zoomStart = curTime;
          zoomEnd = curTime + ZOOMTIME;
          isActiveWebTileFocused = false;
        } else {
          double curTime = SDL_GetTicks() / 1000.0;
          zoomDirection = true;
          zoomStart = curTime;
          zoomEnd = curTime + ZOOMTIME;
        }

        return;
      } else if (event.key.keysym.mod & KMOD_CTRL) {
        if (event.key.keysym.sym == SDLK_LEFT) {
          webTiles[activeWebTile]->webView->GoBack();
          return;
        } else if (event.key.keysym.sym == SDLK_RIGHT) {
          webTiles[activeWebTile]->webView->GoForward();
          return;
        }
      } else if (event.key.keysym.mod & KMOD_ALT && event.key.keysym.sym == SDLK_t) {
        webTiles[activeWebTile]->toggleTransparency();
      } else if (event.key.keysym.mod & KMOD_ALT && event.key.keysym.sym == SDLK_x) {
        if (webTiles.size() > 1) {
          for (std::vector<WebTile*>::iterator i = webTiles.begin(); i !=
               webTiles.end(); ++i) {
            if (*i == webTiles[activeWebTile]) {
              (*i)->webView->Destroy();
              webTiles.erase(i);
              break;
            }
          }

          if (activeWebTile > 0) {
            activeWebTile--;
            startOff = offset + 1;
            animateTo(activeWebTile);
          } else {
            startOff = offset - 1;
            animateTo(activeWebTile);
          }

          webTiles[activeWebTile]->webView->Focus();
          webTiles[activeWebTile]->webView->ResumeRendering();

          return;
        }
      } else if (event.key.keysym.mod & KMOD_ALT && event.key.keysym.sym == SDLK_g) {
        addWebTileWithURL("http://www.google.com", WIDTH, HEIGHT);

        animateTo(webTiles.size() - 1);

        return;
      }

      handleSDLKeyEvent(webTiles[activeWebTile]->webView, event);

      break;
    }
    case SDL_KEYUP: {
      handleSDLKeyEvent(webTiles[activeWebTile]->webView, event);

      break;
    }
    default:
      break;
    }
  }
}

void Application::handleDragBegin(int x, int y) {
  isDragging = true;

  startPos = (x / (double)WIDTH) * 10 - 5;
  startOff = offset;

  isDragging = true;

  startTime = SDL_GetTicks() / 1000.0;
  lastPos = startPos;

  endAnimation();
}

void Application::handleDragMove(int x, int y) {
  double pos = (x / (double)WIDTH) * 10 - 5;

  int max = webTiles.size()-1;

  offset = startOff + (startPos - pos);

  if (offset > max)
    offset = max;

  if (offset < 0)
    offset = 0;

  double time = SDL_GetTicks() / 1000.0;

  if (time - startTime > 0.2) {
    startTime = time;
    lastPos = pos;
  }
}

void Application::handleDragEnd(int x, int y) {
  double pos = (x / (double)WIDTH) * 10 - 5;

  if (isDragging) {
    // Start animation to nearest
    startOff += (startPos - pos);
    offset = startOff;

    double time = SDL_GetTicks() / 1000.0;
    double speed = (lastPos - pos)/((time - startTime) + 0.00001);

    if (speed > MAXSPEED)
      speed = MAXSPEED;

    if (speed < -MAXSPEED)
      speed = -MAXSPEED;

    startAnimation(speed);
  }

  isDragging = false;
}

bool Application::isReadyToQuit() const {
  return shouldQuit;
}

void Application::OnChangeTitle(Awesomium::WebView* caller,
                                const Awesomium::WebString& title) {
}

void Application::OnChangeAddressBar(Awesomium::WebView* caller,
                                     const Awesomium::WebURL& url) {
}

void Application::OnChangeTooltip(Awesomium::WebView* caller,
                                  const Awesomium::WebString& tooltip) {
}

void Application::OnChangeTargetURL(Awesomium::WebView* caller,
                                    const Awesomium::WebURL& url) {
}

void Application::OnChangeCursor(Awesomium::WebView* caller,
                                 Awesomium::Cursor cursor) {
}

void Application::OnChangeFocus(Awesomium::WebView* caller,
                                Awesomium::FocusedElementType focus_type) {
}

void Application::OnAddConsoleMessage(Awesomium::WebView* caller,
                                   const Awesomium::WebString& message,
                                   int line_number,
                                   const Awesomium::WebString& source) {
}

void Application::OnShowCreatedWebView(Awesomium::WebView* caller,
                                       Awesomium::WebView* new_view,
                                       const Awesomium::WebURL& opener_url,
                                       const Awesomium::WebURL& target_url,
                                       const Awesomium::Rect& initial_pos,
                                       bool is_popup) {
  new_view->Resize(WIDTH, HEIGHT);
  WebTile* new_tile = new WebTile(new_view, WIDTH, HEIGHT);
  new_view->set_view_listener(this);
  new_view->set_load_listener(this);
  new_view->set_process_listener(this);

  webTiles.push_back(new_tile);
  animateTo(webTiles.size() - 1);
}

void Application::OnBeginLoadingFrame(Awesomium::WebView* caller,
                                   int64 frame_id,
                                   bool is_main_frame,
                                   const Awesomium::WebURL& url,
                                   bool is_error_page) {
}

void Application::OnFailLoadingFrame(Awesomium::WebView* caller,
                                  int64 frame_id,
                                  bool is_main_frame,
                                  const Awesomium::WebURL& url,
                                  int error_code,
                                  const Awesomium::WebString& error_description) {
}

void Application::OnFinishLoadingFrame(Awesomium::WebView* caller,
                                   int64 frame_id,
                                   bool is_main_frame,
                                   const Awesomium::WebURL& url) {
  if (is_main_frame)
    std::cout << "Page Loaded [" << caller->title() << "]\n";
}

void Application::OnDocumentReady(Awesomium::WebView* caller,
                                  const Awesomium::WebURL& url) {
}

void Application::OnUnresponsive(Awesomium::WebView* caller) {
}

void Application::OnResponsive(Awesomium::WebView* caller) {
}

void Application::OnCrashed(Awesomium::WebView* caller,
                            Awesomium::TerminationStatus status) {
  std::cout << "WebView crashed with status: " << (int)status << std::endl;
}

#define mapKey(a, b) case SDLK_##a: return Awesomium::KeyCodes::AK_##b;

int getWebKeyFromSDLKey(SDLKey key) {
  switch (key) {
    mapKey(BACKSPACE, BACK)
    mapKey(TAB, TAB)
    mapKey(CLEAR, CLEAR)
    mapKey(RETURN, RETURN)
    mapKey(PAUSE, PAUSE)
    mapKey(ESCAPE, ESCAPE)
    mapKey(SPACE, SPACE)
    mapKey(EXCLAIM, 1)
    mapKey(QUOTEDBL, 2)
    mapKey(HASH, 3)
    mapKey(DOLLAR, 4)
    mapKey(AMPERSAND, 7)
    mapKey(QUOTE, OEM_7)
    mapKey(LEFTPAREN, 9)
    mapKey(RIGHTPAREN, 0)
    mapKey(ASTERISK, 8)
    mapKey(PLUS, OEM_PLUS)
    mapKey(COMMA, OEM_COMMA)
    mapKey(MINUS, OEM_MINUS)
    mapKey(PERIOD, OEM_PERIOD)
    mapKey(SLASH, OEM_2)
    mapKey(0, 0)
    mapKey(1, 1)
    mapKey(2, 2)
    mapKey(3, 3)
    mapKey(4, 4)
    mapKey(5, 5)
    mapKey(6, 6)
    mapKey(7, 7)
    mapKey(8, 8)
    mapKey(9, 9)
    mapKey(COLON, OEM_1)
    mapKey(SEMICOLON, OEM_1)
    mapKey(LESS, OEM_COMMA)
    mapKey(EQUALS, OEM_PLUS)
    mapKey(GREATER, OEM_PERIOD)
    mapKey(QUESTION, OEM_2)
    mapKey(AT, 2)
    mapKey(LEFTBRACKET, OEM_4)
    mapKey(BACKSLASH, OEM_5)
    mapKey(RIGHTBRACKET, OEM_6)
    mapKey(CARET, 6)
    mapKey(UNDERSCORE, OEM_MINUS)
    mapKey(BACKQUOTE, OEM_3)
    mapKey(a, A)
    mapKey(b, B)
    mapKey(c, C)
    mapKey(d, D)
    mapKey(e, E)
    mapKey(f, F)
    mapKey(g, G)
    mapKey(h, H)
    mapKey(i, I)
    mapKey(j, J)
    mapKey(k, K)
    mapKey(l, L)
    mapKey(m, M)
    mapKey(n, N)
    mapKey(o, O)
    mapKey(p, P)
    mapKey(q, Q)
    mapKey(r, R)
    mapKey(s, S)
    mapKey(t, T)
    mapKey(u, U)
    mapKey(v, V)
    mapKey(w, W)
    mapKey(x, X)
    mapKey(y, Y)
    mapKey(z, Z)
    mapKey(DELETE, DELETE)
    mapKey(KP0, NUMPAD0)
    mapKey(KP1, NUMPAD1)
    mapKey(KP2, NUMPAD2)
    mapKey(KP3, NUMPAD3)
    mapKey(KP4, NUMPAD4)
    mapKey(KP5, NUMPAD5)
    mapKey(KP6, NUMPAD6)
    mapKey(KP7, NUMPAD7)
    mapKey(KP8, NUMPAD8)
    mapKey(KP9, NUMPAD9)
    mapKey(KP_PERIOD, DECIMAL)
    mapKey(KP_DIVIDE, DIVIDE)
    mapKey(KP_MULTIPLY, MULTIPLY)
    mapKey(KP_MINUS, SUBTRACT)
    mapKey(KP_PLUS, ADD)
    mapKey(KP_ENTER, SEPARATOR)
    mapKey(KP_EQUALS, UNKNOWN)
    mapKey(UP, UP)
    mapKey(DOWN, DOWN)
    mapKey(RIGHT, RIGHT)
    mapKey(LEFT, LEFT)
    mapKey(INSERT, INSERT)
    mapKey(HOME, HOME)
    mapKey(END, END)
    mapKey(PAGEUP, PRIOR)
    mapKey(PAGEDOWN, NEXT)
    mapKey(F1, F1)
    mapKey(F2, F2)
    mapKey(F3, F3)
    mapKey(F4, F4)
    mapKey(F5, F5)
    mapKey(F6, F6)
    mapKey(F7, F7)
    mapKey(F8, F8)
    mapKey(F9, F9)
    mapKey(F10, F10)
    mapKey(F11, F11)
    mapKey(F12, F12)
    mapKey(F13, F13)
    mapKey(F14, F14)
    mapKey(F15, F15)
    mapKey(NUMLOCK, NUMLOCK)
    mapKey(CAPSLOCK, CAPITAL)
    mapKey(SCROLLOCK, SCROLL)
    mapKey(RSHIFT, RSHIFT)
    mapKey(LSHIFT, LSHIFT)
    mapKey(RCTRL, RCONTROL)
    mapKey(LCTRL, LCONTROL)
    mapKey(RALT, RMENU)
    mapKey(LALT, LMENU)
    mapKey(RMETA, LWIN)
    mapKey(LMETA, RWIN)
    mapKey(LSUPER, LWIN)
    mapKey(RSUPER, RWIN)
    mapKey(MODE, MODECHANGE)
    mapKey(COMPOSE, ACCEPT)
    mapKey(HELP, HELP)
    mapKey(PRINT, SNAPSHOT)
    mapKey(SYSREQ, EXECUTE)
  default:
    return Awesomium::KeyCodes::AK_UNKNOWN;
  }
}
