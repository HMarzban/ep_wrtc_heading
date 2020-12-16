'use strict';
var _ = require('ep_etherpad-lite/static/js/underscore');
var tags = ['nd-video'];

var collectContentPre = function collectContentPre(hook, context) {
  const tname = context.tname;
  const state = context.state;
  const lineAttributes = state.lineAttributes;
  const tagIndex = _.indexOf(tags, tname);
  if (tname === 'div' || tname === 'p') {
    delete lineAttributes.headingTagId;
  }
  if (tagIndex >= 0) {
    lineAttributes.headingTagId = context.cls.split(' ')[1];
    _.debounce(() => {
      WRTC_Room.findTags(context);
    }, 250)();
  }
};

exports.collectContentPre = collectContentPre;
