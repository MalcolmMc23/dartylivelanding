import { useCallback } from 'react';
import { useLocalParticipant } from '@livekit/components-react';
import { Track } from 'livekit-client';

export function useMediaControls() {
  const { localParticipant } = useLocalParticipant();

  const cameraPublication = localParticipant?.getTrackPublication(
    Track.Source.Camera
  );
  const microphonePublication = localParticipant?.getTrackPublication(
    Track.Source.Microphone
  );

  const isCameraEnabled = !!cameraPublication && !cameraPublication.isMuted;
  const isMicEnabled =
    !!microphonePublication && !microphonePublication.isMuted;

  const toggleCamera = useCallback(() => {
    if (localParticipant) {
      localParticipant.setCameraEnabled(!isCameraEnabled);
    }
  }, [localParticipant, isCameraEnabled]);

  const toggleMicrophone = useCallback(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(!isMicEnabled);
    }
  }, [localParticipant, isMicEnabled]);

  return {
    isCameraEnabled,
    isMicEnabled,
    toggleCamera,
    toggleMicrophone
  };
} 