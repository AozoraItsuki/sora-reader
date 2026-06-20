/* eslint-disable */

class Reader {
  constructor() {
    const {
      readerSettings,
      chapterGeneralSettings,
      novel,
      chapter,
      nextChapter,
      prevChapter,
      batteryLevel,
      autoSaveInterval,
      strings,
    } = initialReaderConfig;

    // state
    this.hidden = van.state(true);
    this.batteryLevel = van.state(batteryLevel);
    this.readerSettings = van.state(readerSettings);
    this.generalSettings = van.state(chapterGeneralSettings);

    this.chapterElement = document.querySelector('#LNReader-chapter');
    this.selection = window.getSelection();
    this.viewport = document.querySelector('meta[name=viewport]');

    this.novel = novel;
    this.chapter = chapter;
    this.nextChapter = nextChapter;
    this.prevChapter = prevChapter;
    this.strings = strings;
    this.autoSaveInterval = autoSaveInterval;
    this.rawHTML = this.chapterElement.innerHTML;

    // layout props
    this.paddingTop = parseInt(
      getComputedStyle(document.querySelector('body')).getPropertyValue(
        'padding-top'
      ),
      10
    );
    this.chapterHeight = this.chapterElement.scrollHeight + this.paddingTop;
    this.layoutHeight = window.screen.height;
    this.layoutWidth = window.screen.width;

    this.layoutEvent = undefined;
    this.chapterEndingVisible = van.state(false);

    let lastScrollSaveTime = 0;

    document.onscrollend = () => {
      if (!this.generalSettings.val.pageReader) {
        const now = Date.now();
        if (now - lastScrollSaveTime < 300) return;
        lastScrollSaveTime = now;

        const scrollY = window.scrollY;
        const innerHeight = window.innerHeight;
        const viewportBottom = scrollY + innerHeight;

        // Find which chapter block is currently being read
        const chapBlocks = document.querySelectorAll('.lnreader-chapter-block');
        let targetBlock = null;

        if (chapBlocks.length > 1) {
          // Multiple blocks = infinite scroll active; find block whose top
          // is at or above the middle of the viewport
          const viewportMid = scrollY + innerHeight * 0.5;
          for (let i = 0; i < chapBlocks.length; i++) {
            const el = chapBlocks[i];
            const top = el.getBoundingClientRect().top + scrollY;
            if (top <= viewportMid) {
              targetBlock = el;
            }
          }
          if (!targetBlock) {
            targetBlock = chapBlocks[0];
          }
        }

        let finalProgress = 100;
        let chapterId = this.chapter.id;

        if (targetBlock) {
          // Calculate local progress within the chapter block
          const blockTop = targetBlock.getBoundingClientRect().top + scrollY;
          const blockHeight = targetBlock.offsetHeight;
          chapterId = parseInt(targetBlock.dataset.chapterId || String(this.chapter.id), 10);
          const readPx = Math.max(0, viewportBottom - blockTop);
          finalProgress = blockHeight > 0
            ? Math.min(100, parseInt((readPx / blockHeight) * 100, 10))
            : 100;
        } else {
          // Single chapter or fallback: use global scroll ratio
          const scrollHeight =
            document.documentElement.scrollHeight || document.body.scrollHeight;
          const maxScrollY = scrollHeight - innerHeight;
          const ratio = maxScrollY > 0 ? scrollY / maxScrollY : 1;
          finalProgress = Math.min(100, parseInt(ratio * 100, 10));
        }

        this.post({
          type: 'save',
          data: finalProgress,
          chapterId: chapterId,
        });
      }
    };
  }

  post = (obj) => {
    window.ReactNativeWebView.postMessage(JSON.stringify(obj));
  };

  refetch = () => {
    this.post({ type: 'refetch' });
  };

  refresh = () => {
    if (this.generalSettings.val.pageReader) {
      this.chapterWidth = this.chapterElement.scrollWidth;
    } else {
      this.chapterHeight = this.chapterElement.scrollHeight + this.paddingTop;
    }
  };
}

window.reader = new Reader();

// Support legacy JavaScript variables from LNReader v1
/**
 * @param {string} globalName
 * @param {function} getParent
 * @param {string} key
 * @deprecated
 */
function defineSafeProp(globalName, getParent, key) {
  Object.defineProperty(window, globalName, {
    get() {
      return getParent()?.[key];
    },
    set(value) {
      const parent = getParent();
      if (parent) {
        parent[key] = value;
      }
    },
    configurable: true,
  });
}

defineSafeProp('novelName',   () => window.reader?.novel,   'name');
defineSafeProp('chapterName', () => window.reader?.chapter, 'name');
defineSafeProp('sourceId',    () => window.reader?.novel,   'pluginId');
defineSafeProp('chapterId',   () => window.reader?.chapter, 'id');
defineSafeProp('novelId',     () => window.reader?.novel,   'id');
defineSafeProp('html',        () => window.chapterElement,  'innerHTML');