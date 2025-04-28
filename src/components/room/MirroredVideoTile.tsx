"use client";

import {
  ParticipantTile,
  TrackReferenceOrPlaceholder,
} from "@livekit/components-react";
import { CSSProperties, useMemo } from "react";

interface MirroredVideoTileProps {
  trackRef: TrackReferenceOrPlaceholder;
  className?: string;
  style?: CSSProperties;
}

export function MirroredVideoTile({
  trackRef,
  className,
  style,
}: MirroredVideoTileProps) {
  // Check if this is a local participant's camera
  const isLocalCamera = useMemo(() => {
    return trackRef.participant?.isLocal === true;
  }, [trackRef.participant]);

  // Apply mirroring style for local camera only
  const mirrorStyle: CSSProperties = useMemo(() => {
    if (isLocalCamera) {
      return {
        ...style,
        transform: "scaleX(-1)",
      };
    }
    return style || {};
  }, [isLocalCamera, style]);

  return (
    <ParticipantTile
      trackRef={trackRef}
      className={className}
      style={mirrorStyle}
    />
  );
}
