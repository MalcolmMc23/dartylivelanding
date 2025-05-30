"use client";

import { useEffect, useRef } from "react";
import { Participant, Track, TrackPublication } from "livekit-client";

interface ParticipantVideoProps {
  participant: Participant;
  isLocal?: boolean;
  className?: string;
}

function ParticipantVideo({
  participant,
  isLocal = false,
  className = "",
}: ParticipantVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const videoElement = videoRef.current;
    const audioElement = audioRef.current;

    if (!videoElement || !audioElement) return;

    const handleTrackSubscribed = (track: Track) => {
      if (track.kind === Track.Kind.Video) {
        track.attach(videoElement);
      } else if (track.kind === Track.Kind.Audio && !isLocal) {
        // Don't attach local audio to prevent echo
        track.attach(audioElement);
      }
    };

    const handleTrackUnsubscribed = (track: Track) => {
      track.detach();
    };

    // Handle existing tracks
    participant.videoTrackPublications.forEach(
      (publication: TrackPublication) => {
        if (publication.track) {
          handleTrackSubscribed(publication.track);
        }
      }
    );

    participant.audioTrackPublications.forEach(
      (publication: TrackPublication) => {
        if (publication.track && !isLocal) {
          handleTrackSubscribed(publication.track);
        }
      }
    );

    // Listen for new tracks
    participant.on("trackSubscribed", handleTrackSubscribed);
    participant.on("trackUnsubscribed", handleTrackUnsubscribed);

    return () => {
      participant.off("trackSubscribed", handleTrackSubscribed);
      participant.off("trackUnsubscribed", handleTrackUnsubscribed);

      // Detach all tracks
      participant.videoTrackPublications.forEach(
        (publication: TrackPublication) => {
          if (publication.track) {
            publication.track.detach();
          }
        }
      );

      participant.audioTrackPublications.forEach(
        (publication: TrackPublication) => {
          if (publication.track) {
            publication.track.detach();
          }
        }
      );
    };
  }, [participant, isLocal]);

  return (
    <div
      className={`relative bg-gray-900 rounded-lg overflow-hidden ${className}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal} // Mute local video to prevent echo
        className="w-full h-full object-cover"
      />
      <audio ref={audioRef} autoPlay />

      {/* Participant name overlay */}
      <div className="absolute bottom-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
        {isLocal ? "You" : participant.identity || "Anonymous"}
      </div>

      {/* Connection status indicators */}
      <div className="absolute top-2 right-2 flex space-x-1">
        {participant.isCameraEnabled ? (
          <div
            className="w-2 h-2 bg-green-500 rounded-full"
            title="Camera on"
          />
        ) : (
          <div className="w-2 h-2 bg-red-500 rounded-full" title="Camera off" />
        )}
        {participant.isMicrophoneEnabled ? (
          <div
            className="w-2 h-2 bg-green-500 rounded-full"
            title="Microphone on"
          />
        ) : (
          <div
            className="w-2 h-2 bg-red-500 rounded-full"
            title="Microphone off"
          />
        )}
      </div>
    </div>
  );
}

interface LiveKitVideoCallProps {
  localParticipant: Participant | null;
  remoteParticipants: Participant[];
  className?: string;
}

export default function LiveKitVideoCall({
  localParticipant,
  remoteParticipants,
  className = "",
}: LiveKitVideoCallProps) {
  const remoteParticipant = remoteParticipants[0]; // For 1-on-1 chat

  if (!localParticipant) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-900 rounded-lg ${className}`}
      >
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
          <p>Connecting to video...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full ${className}`}>
      {/* Remote participant (main view) */}
      {remoteParticipant ? (
        <ParticipantVideo
          participant={remoteParticipant}
          className="w-full h-full"
        />
      ) : (
        <div className="w-full h-full bg-gray-900 flex items-center justify-center rounded-lg">
          <div className="text-center text-white">
            <div className="animate-pulse rounded-full h-16 w-16 bg-gray-700 mx-auto mb-4"></div>
            <p className="text-lg">Waiting for someone to join...</p>
            <p className="text-sm text-gray-400 mt-2">
              The other person will appear here
            </p>
          </div>
        </div>
      )}

      {/* Local participant (picture-in-picture) */}
      <div className="absolute bottom-4 right-4 w-32 h-24 border-2 border-white rounded-lg overflow-hidden shadow-lg">
        <ParticipantVideo
          participant={localParticipant}
          isLocal={true}
          className="w-full h-full"
        />
      </div>
    </div>
  );
}
