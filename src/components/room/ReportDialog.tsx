"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportedUserId: number;
}

export function ReportDialog({ open, onOpenChange, reportedUserId }: ReportDialogProps) {
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement report submission
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-[#1A1A1A] border border-[#2A2A2A] text-white rounded-2xl shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center text-white">
            Report User
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <Label className="text-gray-300">Reason for Report</Label>
            <RadioGroup
              value={reason}
              onValueChange={setReason}
              className="space-y-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="inappropriate" id="inappropriate" />
                <Label htmlFor="inappropriate" className="text-gray-300">
                  Inappropriate Behavior
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="harassment" id="harassment" />
                <Label htmlFor="harassment" className="text-gray-300">
                  Harassment
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="spam" id="spam" />
                <Label htmlFor="spam" className="text-gray-300">
                  Spam
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="other" />
                <Label htmlFor="other" className="text-gray-300">
                  Other
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description" className="text-gray-300">
              Additional Details
            </Label>
            <Textarea
              id="description"
              placeholder="Please provide any additional details about your report..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="bg-[#2A2A2A] border border-[#3A3A3A] text-white focus:ring-[#A855F7] focus:border-[#A855F7] rounded-xl min-h-[100px]"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="bg-[#2A2A2A] text-white hover:bg-[#3A3A3A]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!reason}
              className="bg-[#A855F7] text-white hover:bg-[#9333EA]"
            >
              Submit Report
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 