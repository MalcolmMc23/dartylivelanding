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
            className="w-full max-w-lg h-auto rounded-xl overflow-hidden border-2 border-[#212121] shadow-lg transition-all relative"
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
      <div className="flex flex-col items-center justify-center h-full w-full p-4">
        <div className="w-full max-w-lg aspect-video rounded-xl overflow-hidden border-2 border-[#212121] shadow-lg relative">
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
    <div className="w-full p-2 md:p-4 flex flex-col items-center justify-center gap-3 md:gap-6">
      {renderedTracks}
    </div>
  );
} 