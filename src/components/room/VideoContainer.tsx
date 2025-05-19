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
  const renderedTracks = useMemo(() => {
    console.log("Rendering tracks:", cameraTracks.length);
    return cameraTracks.map(
      (track: TrackReferenceOrPlaceholder, index: number) => {
        const participantIdentity =
          track.participant?.identity || (index === 0 ? "You" : "Participant");
        const isLocalParticipant = track.participant?.isLocal || false;

        return (
          <div
            key={track.publication?.trackSid || `participant-${index}`}
            className="w-[95%] max-w-[95%] h-auto rounded-lg overflow-hidden border border-[#212121] shadow-md transition-all relative"
            style={{ aspectRatio: "16 / 9" }}
          >
            <MirroredVideoTile trackRef={track} className="h-full" />
            <div
              className="absolute bottom-6 left-6 bg-black bg-opacity-80 px-4 py-2 rounded-md text-white text-base font-medium z-40 shadow-md"
              id={`custom-name-tag-${
                isLocalParticipant ? "local" : track.participant?.identity
              }`}
            >
              {isLocalParticipant ? "You" : participantIdentity}
            </div>
          </div>
        );
      }
    );
  }, [cameraTracks]);

  if (totalParticipants === 1) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-[95%] max-w-[95%] p-0">
        <div className="w-full aspect-video rounded-lg overflow-hidden border border-[#212121] shadow-md relative">
          {cameraTracks.length > 0 && (
            <>
              <MirroredVideoTile
                trackRef={cameraTracks[0]}
                className="h-full"
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
    <div className="w-[95%] max-w-[95%] p-0 md:p-0.5 flex flex-col items-center justify-center gap-0 md:gap-0.5">
      {renderedTracks}
    </div>
  );
} 