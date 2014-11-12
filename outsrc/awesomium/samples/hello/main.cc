/**
 * This is a simple "Hello World!" example of using Awesomium.
 *
 * It loads a page and saves a rendered bitmap of it to a JPEG.
 *
 * Procedure:
 * -- Create the WebCore singleton
 * -- Create a new WebView and request for it to load a URL.
 * -- Wait for the WebView to finish loading.
 * -- Retrieve the BitmapSurface from the WebView.
 * -- Save the BitmapSurface to 'result.jpg'.
 * -- Clean up.
 */

// Various included headers
#include <Awesomium/WebCore.h>
#include <Awesomium/BitmapSurface.h>
#include <Awesomium/STLHelpers.h>
#include <iostream>
#include <stdlib.h>
#if defined(__WIN32__) || defined(_WIN32)
#include <windows.h>
#elif defined(__APPLE__)
#include <unistd.h>
#endif

// Various macro definitions
#define WIDTH   1000
#define HEIGHT  715
#define URL     "http://www.google.com"

using namespace Awesomium;

// Forward declaration of our update function
void Update(int sleep_ms);

// Our main program
int main(int argc, char **argv) {
  // Parse command lin
  const char* url_name = URL;
  const char* out_file = "./result.jpg";
  int width = WIDTH;
  int height = HEIGHT;
  if (argc > 1) {
    url_name = argv[1];
    if (argc > 2) {
      out_file = argv[2];
    }
    if (argc > 4) {
      width = atoi(argv[3]);
      height = atoi(argv[4]);
    }
  }

  WebPreferences wp;
  wp.enable_plugins = true;
  wp.user_stylesheet = WSLit("body { overflow:hidden; }");

  // Create the WebCore singleton with custom configuration
  WebCore* web_core = WebCore::Initialize(WebConfig());

  WebSession* session = web_core->CreateWebSession(WSLit(""), wp);  

  // Create a new WebView instance with a certain width and height, using the
  // WebCore we just created
  WebView* view = web_core->CreateWebView(WIDTH, HEIGHT, session);

  // This is how to execute javascript on the bad boy
  // char* js="var myPrefs = new WebPreferences(); myPrefs.CustomCSS = 'body { overflow:hidden; }';myPrefs;";
  // JSValue my_value = view->ExecuteJavascriptWithResult(WSLit(js), WSLit(""));
  // std::cout << my_value.ToString() << std::endl;;

  // Load a certain URL into our WebView instance
  std::cout << "out_file: " << out_file << std::endl;;
  WebURL url(WSLit(url_name));
  view->LoadURL(url);

  std::cout << "Page is now loading..." << std::endl;;

  // Wait for our WebView to finish loading
  while (view->IsLoading())
    Update(50);

  std::cout << "Page has finished loading." << std::endl;

  std::cout << "Page title is: " << view->title() << std::endl;

  // Update once more a little longer to allow scripts and plugins
  // to finish loading on the page.
  int count = 100;
  while (count--) {
    Update(50);
    usleep(50000);
  }

  // Get the WebView's rendering Surface. The default Surface is of
  // type 'BitmapSurface', we must cast it before we can use it.
  BitmapSurface* surface = (BitmapSurface*)view->surface();

  // Make sure our surface is not NULL-- it may be NULL if the WebView 
  // process has crashed.
  if (surface != NULL) {
    // Save our BitmapSurface to a JPEG image
    surface->SaveToJPEG(WSLit(out_file));

    std::cout << "Saved a render of the page to '" << out_file << "'." << std::endl;

//     // Open up the saved JPEG
// #if defined(__WIN32__) || defined(_WIN32)
//     system("start result.jpg");
// #elif defined(__APPLE__)
//     system("open result.jpg");
// #endif
  }

  // Destroy our WebView instance
  view->Destroy();

  // Update once more before we shutdown for good measure
  Update(100);

  // Destroy our WebCore instance
  WebCore::Shutdown();

  return 0;
}

void Update(int sleep_ms) {
  // Sleep a specified amount
#if defined(__WIN32__) || defined(_WIN32)
  Sleep(sleep_ms);
#elif defined(__APPLE__)
  usleep(sleep_ms * 1000);
#else
  sleep(sleep_ms / 1000);
#endif

  // You must call WebCore::update periodically
  // during the lifetime of your application.
  WebCore::instance()->Update();
}
