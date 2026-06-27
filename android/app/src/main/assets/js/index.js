/* eslint-disable */

const { div, p, img, button } = van.tags;

const ChapterEnding = () => {
  return () =>
    reader.generalSettings.val.pageReader
      ? div()
      : div(div({ class: 'info-text' }, reader.strings.finished), () =>
          reader.nextChapter
            ? button(
                {
                  class: 'next-button',
                  onclick: e => {
                    e.stopPropagation();
                    reader.post({ type: 'next' });
                  },
                },
                reader.strings.nextChapter,
              )
            : div({ class: 'info-text' }, reader.strings.noNextChapter),
        );
};


const ImageModal = ({ src }) => {
  return div(
    {
      id: 'Image-Modal',
      class: () => (src.val ? 'show' : ''),
      onclick: e => {
        if (e.target.id !== 'Image-Modal-img') {
          e.stopPropagation();
          src.val = '';
        }
      },
    },
    img({
      id: 'Image-Modal-img',
      src: src,
      alt: () => (src.val ? `Cant not render image from ${src.val}` : ''),
    }),
  );
};

const ModalWrapper = () => {
  const imgSrc = van.state('');
  const showImage = src => {
    imgSrc.val = src;
    reader.viewport.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, maximum-scale=10',
    );
  };
  const hideImage = () => {
    imgSrc.val = '';
    reader.viewport.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, maximum-scale=1.0',
    );
  };

  document.addEventListener('contextmenu', e => {
    if (e.target instanceof HTMLImageElement) {
      if (!imgSrc.val) {
        showImage(e.target.src);
      } else {
        hideImage();
      }
    }
  });
  return div(ImageModal({ src: imgSrc }));
};

const Footer = () => {
  const percentage = van.state(0);
  const time = van.state(
    new Date().toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
  );
  window.addEventListener('scroll', () => {
    const scrollHeight =
      document.documentElement.scrollHeight || document.body.scrollHeight;
    const maxScrollY = scrollHeight - window.innerHeight;
    let ratio = maxScrollY > 0 ? window.scrollY / maxScrollY : 1;
    if (ratio > 1) {
      ratio = 1;
    }
    if (ratio < 0) {
      ratio = 0;
    }
    percentage.val = parseInt(ratio * 100);
  });
  setInterval(() => {
    time.val = new Date().toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }, 10000);
  return div(
    {
      id: 'reader-footer-wrapper',
      class: () =>
        reader.generalSettings.val.showBatteryAndTime ||
        reader.generalSettings.val.showScrollPercentage
          ? ''
          : 'd-none',
    },
    div(
      { id: 'reader-footer' },

      div(
        {
          id: 'reader-battery',
          class: () =>
            `reader-footer-item ${
              reader.generalSettings.val.showBatteryAndTime ? '' : 'hidden'
            }`,
        },
        () => Math.floor(reader.batteryLevel.val * 100) + '%',
      ),
      div(
        {
          id: 'reader-percentage',
          class: () =>
            `reader-footer-item ${
              reader.generalSettings.val.showScrollPercentage ? '' : 'hidden'
            }`,
        },
        () =>
          reader.generalSettings.val.pageReader
            ? `${pageReader.page.val + 1}/${pageReader.totalPages.val}`
            : percentage.val + '%',
      ),
      div(
        {
          id: 'reader-time',
          class: () =>
            `reader-footer-item ${
              reader.generalSettings.val.showBatteryAndTime ? '' : 'hidden'
            }`,
        },
        time,
      ),
    ),
  );
};

const TTSController = () => {
  let controllerElement = null;
  let hoverElement = null;
  let clientX = null;
  let clientY = null;
  return div(
    {
      id: 'TTS-Controller',
      class: () => `${reader.generalSettings.val.TTSEnable ? '' : 'hidden'}`,
      style: () =>
        reader.generalSettings.val.TTSEnable
          ? 'pointer-events: auto;'
          : 'pointer-events: none; display: none !important; opacity: 0; transition: none;',
      ontouchstart: () => {
        if (!controllerElement) {
          controllerElement = document.getElementById('TTS-Controller');
        }
        controllerElement.classList.add('active');
        controllerElement.style.transition = '';
      },
      ontouchmove: e => {
        e.preventDefault();
        e.stopPropagation();
        clientX = e.changedTouches[0].clientX;
        clientY = e.changedTouches[0].clientY;
        controllerElement.style.left = `${clientX}px`;
        controllerElement.style.top = `${clientY}px`;
        const hoverElements = document.elementsFromPoint(clientX, clientY);
        const newHoverElement = hoverElements.reverse().find(e => {
          return tts.readable(e);
        });
        hoverElement?.classList.remove('highlight');
        if (newHoverElement) {
          newHoverElement.classList.add('highlight');
          hoverElement = newHoverElement;
        } else {
          hoverElement = null;
        }
      },
      ontouchend: () => {
        controllerElement.style.transition = '1s';
        controllerElement.classList.remove('active');
        controllerElement.style.left = '20px';
        if (clientX && clientY) {
          let top = clientY < 120 ? 120 : clientY;
          if (top + 120 > reader.layoutHeight) {
            top = reader.layoutHeight - 120;
          }
          controllerElement.style.top = `${top}px`;
          // Check if TTS is still enabled before starting
          if (hoverElement && reader.generalSettings.val.TTSEnable) {
            tts.start(hoverElement);
            controllerElement.firstElementChild.innerHTML = pauseIcon;
          }
        }
        clientX = null;
        clientY = null;
      },
      onclick: e => {
        e.stopPropagation();
        // Don't allow interaction if TTS is disabled
        if (!reader.generalSettings.val.TTSEnable) {
          return;
        }
        if (tts.reading) {
          tts.pause();
          controllerElement.firstElementChild.innerHTML = resumeIcon;
        } else if (tts.started) {
          tts.resume();
          controllerElement.firstElementChild.innerHTML = pauseIcon;
        } else {
          tts.start();
          controllerElement.firstElementChild.innerHTML = pauseIcon;
        }
      },
    },
    button({ innerHTML: volumeIcon }),
  );
};

const ReaderUI = () => {
  return div(
    TTSController(),
    ModalWrapper(),
    Footer(),
    ChapterEnding(),
  );
};

van.add(document.getElementById('reader-ui'), ReaderUI());
