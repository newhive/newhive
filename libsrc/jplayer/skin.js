$.jPlayer.skin = {
    basic : function(url, index){
        return '<div class="content drag">' +
        '<div data-index="' + index + '" id="jquery_jplayer_' + index + '" class="jp-jplayer" data-url="' + url + '"></div>' +
        '<div id="jp_container_' + index + '" class="jp-audio basic">' +
        '  <div class="jp-type-single">' +
        '    <div class="jp-gui jp-interface">' +
        '      <ul class="jp-controls">' +
        '        <li><a href="javascript:;" class="jp-play" tabindex="1">play</a></li>' +
        '        <li><a href="javascript:;" class="jp-pause" tabindex="1">pause</a></li>' +
        '        <li><a href="javascript:;" class="jp-stop" tabindex="1">stop</a></li>' +
        '        <li><a href="javascript:;" class="jp-mute" tabindex="1" title="mute">mute</a></li>' +
        '        <li><a href="javascript:;" class="jp-unmute" tabindex="1" title="unmute">unmute</a></li>' +
        '        <li><a href="javascript:;" class="jp-volume-max" tabindex="1" title="max volume">max volume</a></li>' +
        '      </ul>' +
        '      <div class="jp-progress">' +
        '        <div class="jp-seek-bar">' +
        '          <div class="jp-play-bar"></div>' +
        '        </div>' +
        '      </div>' +
        '      <div class="jp-volume-bar">' +
        '        <div class="jp-volume-bar-value"></div>' +
        '      </div>' +
        '      <div class="jp-time-holder">' +
        '        <div class="jp-current-time"></div>' +
        '        <div class="jp-duration"></div>' +
        '        <ul class="jp-toggles">' +
        '          <li><a href="javascript:;" class="jp-repeat" tabindex="1" title="repeat">repeat</a></li>' +
        '          <li><a href="javascript:;" class="jp-repeat-off" tabindex="1" title="repeat off">repeat off</a></li>' +
        '        </ul>' +
        '      </div>' +
        '    </div>' +
        '    <div class="jp-no-solution">' +
        '      <span>Update Required</span>' +
        '      To play this media you will need to either update your browser to a recent version or update your <a href="http://get.adobe.com/flashplayer/" target="_blank">Flash plugin</a>.' +
        '    </div>' +
        '  </div>' +
        '</div>' +
        '</div>'
    }
    , minimal : function(url, index){
        return '<div>' +
        '<div data-index="' + index + '" id="jquery_jplayer_' + index + '" class="jp-jplayer" data-url="' + url + '"></div>' +
        '<div id="jp_container_' + index + '" class="jp-audio minimal">' +
        '  <div class="jp-gui jp-interface">' +
        '    <div class="jp-controls jp-button">' +
        '      <a href="javascript:;" class="jp-play jp-button" tabindex="1"><img src="/lib/skin/1/jplayer/play.svg" class="jp-button"></a>' +
        '      <a href="javascript:;" class="jp-pause jp-button" tabindex="1"><img src="/lib/skin/1/jplayer/pause.svg" class="jp-button"></a>' +
        '    </div>' +
        '    <div class="jp-progress">' +
        '      <div class="jp-seek-wrapper">' +
        '      <div class="jp-seek-bar">' +
        '        <div class="jp-play-bar" style="width: 25%"></div>' +
        '      </div>' +
        '      </div>' +
        '      <div class="jp-remaining-time"></div>' +
        '      <div class="jp-volume">' +
        '        <div class="jp-volume-buttons">' +
        '          <div class="jp-volume-plus button">' +
        '            <span>+</span>' +
        '          </div>' +
        '          <div class="jp-volume-minus button">' +
        '            <span>-<span>' +
        '          </div>' +
        '        </div>' +
        '        <div class="jp-volume-bar">' +
        '          <div class="jp-volume-bar-value"></div>' +
        '        </div>' +
        '      </div>' +
        '    </div>' +
        '  </div>' +
        '  <div class="jp-no-solution">' +
        '    <span>Update Required</span>' +
        '    To play this media you will need to either update your browser to a recent version or update your <a href="http://get.adobe.com/flashplayer/" target="_blank">Flash plugin</a>.' +
        '  </div>' +
        '</div>' +
        '</div>'
    }
}
