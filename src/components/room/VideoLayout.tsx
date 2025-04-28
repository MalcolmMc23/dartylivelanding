"use client";

import {
  useParticipants,
  ParticipantTile,
  useTracks,
  TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

export function VideoLayout() {
  const participants = useParticipants();
  const totalParticipants = participants.length + 1; // Including local participant

  // Get camera and screen share tracks
  const cameraTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { updateOnlyOn: [] }
  );

  // Define custom layout for the video tiles
  const videoLayout = useMemo(() => {
    if (totalParticipants === 1) {
      // Only local participant - centered large tile with prompt
      return (
        <div className="flex flex-col items-center justify-center h-full w-full p-4">
          <div className="w-full max-w-2xl aspect-video rounded-xl overflow-hidden border-2 border-[#212121] shadow-lg">
            {cameraTracks.length > 0 && (
              <ParticipantTile
                trackRef={cameraTracks[0] as TrackReferenceOrPlaceholder}
                className="h-full"
                style={{ aspectRatio: "16 / 9" }}
              />
            )}
          </div>
          <div className="mt-6 text-gray-300 text-center">
            <p className="text-xl font-semibold mb-2">
              Waiting for someone to join...
            </p>
            <p className="text-sm opacity-75">
              Hang tight! You&apos;ll be connected with someone soon.
            </p>
          </div>
        </div>
      );
    } else {
      // Two participants - display side by side or stacked depending on screen width
      return (
        <div className="w-full h-full p-2 md:p-4 flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4">
          {cameraTracks.map((track, index) => {
            return (
              <div
                key={track.publication?.trackSid || `participant-${index}`}
                className={cn(
                  "w-full md:w-1/2 max-w-xl h-auto rounded-xl overflow-hidden border-2",
                  "border-[#212121] shadow-lg transition-all",
                  track.publication?.isMuted ? "opacity-50" : "opacity-100"
                )}
                style={{ aspectRatio: "16 / 9" }}
              >
                <ParticipantTile
                  trackRef={track as TrackReferenceOrPlaceholder}
                  className="h-full"
                />
              </div>
            );
          })}
        </div>
      );
    }
  }, [cameraTracks, totalParticipants]);

  return <div className="relative w-full h-full">{videoLayout}</div>;
}
