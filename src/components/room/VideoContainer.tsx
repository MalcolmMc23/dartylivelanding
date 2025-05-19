"use client";

import { useParticipants, useTracks, TrackReferenceOrPlaceholder } from "@livekit/components-react";
import { Track } from "livekit-client";
import { MirroredVideoTile } from "./MirroredVideoTile";
import { useMemo, useRef, useEffect } from "react";

interface VideoContainerProps {
  otherParticipantLeft?: boolean;
}

export function VideoContainer({ otherParticipantLeft }: VideoContainerProps) {
  const participants = useParticipants();
  const totalParticipants = participants.length + 1; // Including local participant

  // Track render count to help debug infinite renders
  const renderCount = useRef(0);
  useEffect(() => {
    renderCount.current += 1;
    console.log(
      `VideoContainer rendered: ${renderCount.current} times${
        otherParticipantLeft ? " (other participant left)" : ""
      }`
    );
  }, [otherParticipantLeft]);

  // Get camera and screen share tracks with useMemo to prevent unnecessary processing
  const trackSources = useMemo(
    () => [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    []
  );

  // Memoize the options object to prevent it from causing re-renders
  const trackOptions = useMemo(
    () => ({
      updateOnlyOn: [],
      onlySubscribed: false,
    }),
    []
  );

  const cameraTracks = useTracks(trackSources, trackOptions);

  // Memoize the rendered tracks to prevent unnecessary re-renders
  // rendered tracks does not get used, commented out for deployment
  // const renderedTracks = useMemo(() => {
  //   console.log("Rendering tracks:", cameraTracks.length);
  //   return cameraTracks.map(
  //     (track: TrackReferenceOrPlaceholder, index: number) => {
  //       const participantIdentity =
  //         track.participant?.identity || (index === 0 ? "You" : "Participant");
  //       const isLocalParticipant = track.participant?.isLocal || false;

  //       return (
  //         <div
  //           key={track.publication?.trackSid || `participant-${index}`}
  //           className="w-full h-auto rounded-lg overflow-hidden border border-[#212121] shadow-md transition-all relative"
  //           style={{ aspectRatio: "16 / 9" }}
  //         >
  //           <MirroredVideoTile trackRef={track} className="h-full" />
  //           <div
  //             className="absolute bottom-6 left-6 bg-black bg-opacity-80 px-4 py-2 rounded-md text-white text-base font-medium z-40 shadow-md"
  //             id={`custom-name-tag-${
  //               isLocalParticipant ? "local" : track.participant?.identity
  //             }`}
  //           >
  //             {isLocalParticipant ? "You" : participantIdentity}
  //           </div>
  //         </div>
  //       );
  //     }
  //   );
  // }, [cameraTracks]);

  // Calculate the max width for two stacked 16:9 videos to fit in 75vh
  // Each video: height = h, width = (16/9) * h
  // For two videos: 2h <= 75vh => h = 37.5vh, width = (16/9)*37.5vh ≈ 66.67vw (but limited by 75vw)
  // So, max width = min(75vw, (16/9)*37.5vh)

  // Helper for max width: min(75vw, (16/9)*75vh) for one, min(75vw, (16/9)*37.5vh) for two
  const oneTileStyle = {
    maxWidth: 'min(75vw, calc(75vh * 16 / 9))',
    maxHeight: '75vh',
    width: '100%',
    height: '100%',
  };
  const twoTileStyle = {
    maxWidth: 'min(75vw, calc(37.5vh * 16 / 9))',
    maxHeight: '37.5vh',
    width: '100%',
    height: '100%',
  };

  if (totalParticipants === 1) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div
          className="aspect-[16/9] rounded-lg overflow-hidden border border-[#212121] shadow-md relative flex items-center justify-center"
          style={oneTileStyle}
        >
          {cameraTracks.length > 0 && (
            <>
              <MirroredVideoTile
                trackRef={cameraTracks[0]}
                className="w-full h-full"
                style={{ aspectRatio: "16 / 9" }}
              />
              <div
                className="absolute bottom-6 left-6 bg-black bg-opacity-80 px-4 py-2 rounded-md text-white text-base font-medium z-40 shadow-md"
                id="custom-name-tag-local"
              >
                You
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col items-center justify-center gap-4">
      {cameraTracks.slice(0, 2).map((track, idx) => (
        <div
          key={track.publication?.trackSid || `participant-${idx}`}
          className="aspect-[16/9] rounded-lg overflow-hidden border border-[#212121] shadow-md relative flex items-center justify-center"
          style={twoTileStyle}
        >
          <MirroredVideoTile trackRef={track} className="w-full h-full" />
          <div
            className="absolute bottom-6 left-6 bg-black bg-opacity-80 px-4 py-2 rounded-md text-white text-base font-medium z-40 shadow-md"
            id={`custom-name-tag-${
              track.participant?.isLocal ? "local" : track.participant?.identity
            }`}
          >
            {track.participant?.isLocal ? "You" : track.participant?.identity || "Participant"}
          </div>
        </div>
      ))}
    </div>
  );
}