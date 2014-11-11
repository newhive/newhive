#include "application.h"

int main(int argc, char *argv[]) {
  Application app;

  while (!app.isReadyToQuit())
    app.update();

  return 0;
}
