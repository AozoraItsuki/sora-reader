/* eslint-disable */

// theme.js
(() => {
  van.derive(() => {
    const settings = reader.readerSettings.val;
    document.documentElement.style.setProperty(
      '--readerSettings-theme',
      settings.theme,
    );
    document.documentElement.style.setProperty(
      '--readerSettings-padding',
      settings.padding + 'px',
    );
    document.documentElement.style.setProperty(
      '--readerSettings-textSize',
      settings.textSize + 'px',
    );
    document.documentElement.style.setProperty(
      '--readerSettings-textColor',
      settings.textColor,
    );
    document.documentElement.style.setProperty(
      '--readerSettings-textAlign',
      settings.textAlign,
    );
    document.documentElement.style.setProperty(
      '--readerSettings-lineHeight',
      settings.lineHeight,
    );
    document.documentElement.style.setProperty(
      '--readerSettings-fontFamily',
      settings.fontFamily,
    );
    if (settings.fontFamily) {
      new FontFace(
        settings.fontFamily,
        `url("file:///android_asset/fonts/${settings.fontFamily}.ttf")`,
      )
        .load()
        .then(loadedFont => {
          document.fonts.add(loadedFont);
        });
    } else {
      // have no affect with a font declared in head
      document.fonts.forEach(fontFace => document.fonts.delete(fontFace));
    }
  });
})();

// text options
(() => {
  // innerHTML is derived ONLY from rawHTML plus these two transforms. General
  // settings writes (infiniteScroll, fullScreen, pageReader, ...) must not
  // touch it: rebuilding would wipe the term spans injected at runtime and make
  // highlights blink. Track just the flags the transform actually depends on.
  const htmlTransformKey = settings => [
    settings && settings.bionicReading ? '1' : '0',
    settings && settings.removeExtraParagraphSpacing ? '1' : '0',
  ].join('');
  let lastTransformKey = null;

  van.derive(() => {
    const settings = reader.generalSettings.val;
    const key = htmlTransformKey(settings);
    // null means first run: still apply the initial transforms to rawHTML.
    if (lastTransformKey !== null && key === lastTransformKey) return;
    lastTransformKey = key;

    let html = reader.rawHTML;
    if (settings.bionicReading) {
      html = textVide.textVide(reader.rawHTML);
    }

    if (settings.removeExtraParagraphSpacing) {
      html = html
        .replace(/(?:&nbsp;\s*|[\u200b]\s*)+(?=<\/?p[> ])/g, '')
        .replace(/<br>\s*<br>\s*(?:<br>\s*)+/g, '<br><br>') //force max 2 consecutive <br>, chaining regex
        .replace(
          /<br>\s*<br>[^]+/,
          _ =>
            `${
              /\/p>/.test(_)
                ? _.replace(
                    /<br>\s*<br>(?:(?=\s*<\/?p[> ])|(?<=<\/?p\b[^>]*><br>\s*<br>))\s*/g,
                    '',
                  )
                : _
            }`,
        ) //if p found, delete all double br near p
        .replace(/<br>(?:(?=\s*<\/?p[> ])|(?<=<\/?p>\s*<br>))\s*/g, '');
    }
    reader.chapterElement.innerHTML = html;
  });
})();
