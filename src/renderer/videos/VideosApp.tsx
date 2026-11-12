// Help videos window.
//
// Port of `Doc.VideoViewer`: a small list of tutorial videos and a Vimeo
// player that switches to the selected entry.

import { useState } from "react";

import { ModalFrame } from "../shared/ModalFrame";

interface Video {
  label: string;
  src: string;
}

const VIDEOS: Video[] = [
  {
    label: "Navigation Basics (45s)",
    src: "https://player.vimeo.com/video/639232763?h=7a465b6f4f&badge=0&autopause=0&player_id=0&app_id=58479"
  },
  {
    label: "Writing Basics (52s)",
    src: "https://player.vimeo.com/video/639667560?h=26f784fab2&badge=0&autopause=0&player_id=0&app_id=58479"
  },
  {
    label: "Creating Cards (1m20)",
    src: "https://player.vimeo.com/video/639795192?h=7cc9f0a099&badge=0&autopause=0&player_id=0&app_id=58479"
  },
  {
    label: "Moving Cards (60s)",
    src: "https://player.vimeo.com/video/640443224?h=b894587d96&badge=0&autopause=0&player_id=0&app_id=58479"
  }
];

export function VideosApp() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <ModalFrame title="Help Videos" gutId="video-viewer-container" modalClassName="video-viewer">
      <div id="video-viewer-content">
        <div id="video-viewer-list">
          {VIDEOS.map((video, index) => (
            <div
              key={video.src}
              className={index === activeIndex ? "video-item active-video" : "video-item"}
              onClick={() => setActiveIndex(index)}
            >
              {video.label}
            </div>
          ))}
        </div>
        <div id="video-container">
          <iframe
            src={VIDEOS[activeIndex].src}
            frameBorder="0"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </ModalFrame>
  );
}
