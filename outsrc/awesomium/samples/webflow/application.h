#ifndef __APPLICATION_H__
#define __APPLICATION_H__

#include <vector>
#include <string>
#include "SDL.h"
#include "SDL_opengl.h"
#include <Awesomium/WebCore.h>

// Some constants that configure certain aspects of the animation:
#define SPREADIMAGE         0.1     // The amount of spread between WebTiles
#define FLANKSPREAD         0.4     // How much a WebTile moves way from center
#define FRICTION            10.0    // Friction while "flowing" through WebTiles
#define MAXSPEED            7.0     // Throttle maximum speed to this value
#define ZOOMTIME            0.3     // Speed to zoom in/out of a WebTile
#define TRANSPARENT         1       // Whether or not we should use transparency

// Forward declaration, actually declared in WebTile.h
struct WebTile;

// Our main Application class is responsible for setting up the WebCore, the
// OpenGL scene, handling input, animating "WebTiles", and all other logic.
class Application : public Awesomium::WebViewListener::View,
  public Awesomium::WebViewListener::Load,
  public Awesomium::WebViewListener::Process {
 public:
  Application();
  ~Application();

  void addWebTileWithURL(const std::string& url, int width, int height);

  void update();

  void draw();

  void drawTile(int index, double off, double zoom);

  void updateWebTiles();

  void updateAnimationAtTime(double elapsed);

  void endAnimation();

  void driveAnimation();

  void startAnimation(double speed);

  void animateTo(int index);

  void handleInput();

  void handleDragBegin(int x, int y);

  void handleDragMove(int x, int y);

  void handleDragEnd(int x, int y);

  bool isReadyToQuit() const;

  virtual void OnChangeTitle(Awesomium::WebView* caller,
                             const Awesomium::WebString& title);

  virtual void OnChangeAddressBar(Awesomium::WebView* caller,
                                  const Awesomium::WebURL& url);

  virtual void OnChangeTooltip(Awesomium::WebView* caller,
                               const Awesomium::WebString& tooltip);

  virtual void OnChangeTargetURL(Awesomium::WebView* caller,
                                 const Awesomium::WebURL& url);

  virtual void OnChangeCursor(Awesomium::WebView* caller,
                              Awesomium::Cursor cursor);

  virtual void OnChangeFocus(Awesomium::WebView* caller,
                                Awesomium::FocusedElementType focus_type);

  virtual void OnAddConsoleMessage(Awesomium::WebView* caller,
                                   const Awesomium::WebString& message,
                                   int line_number,
                                   const Awesomium::WebString& source);

  virtual void OnShowCreatedWebView(Awesomium::WebView* caller,
                                    Awesomium::WebView* new_view,
                                    const Awesomium::WebURL& opener_url,
                                    const Awesomium::WebURL& target_url,
                                    const Awesomium::Rect& initial_pos,
                                    bool is_popup);

  virtual void OnBeginLoadingFrame(Awesomium::WebView* caller,
                                   int64 frame_id,
                                   bool is_main_frame,
                                   const Awesomium::WebURL& url,
                                   bool is_error_page);

  virtual void OnFailLoadingFrame(Awesomium::WebView* caller,
                                  int64 frame_id,
                                  bool is_main_frame,
                                  const Awesomium::WebURL& url,
                                  int error_code,
                                  const Awesomium::WebString& error_description);

  virtual void OnFinishLoadingFrame(Awesomium::WebView* caller,
                                    int64 frame_id,
                                    bool is_main_frame,
                                    const Awesomium::WebURL& url);

  virtual void OnDocumentReady(Awesomium::WebView* caller,
                                    const Awesomium::WebURL& url);

  virtual void OnUnresponsive(Awesomium::WebView* caller);

  virtual void OnResponsive(Awesomium::WebView* caller);

  virtual void OnCrashed(Awesomium::WebView* caller,
                         Awesomium::TerminationStatus status);

 protected:
  bool shouldQuit, isAnimating, isDragging, isActiveWebTileFocused,
       zoomDirection;
  double offset, startTime, startOff, startPos, startSpeed, runDelta, lastPos,
         zoomStart, zoomEnd;
  int numTiles;
  std::vector<WebTile*> webTiles;
  GLfloat customColor[16];
  int activeWebTile;
  Awesomium::WebCore* webCore;
  int WIDTH, HEIGHT;
};

#endif
