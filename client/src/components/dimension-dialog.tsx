import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface DimensionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (value: string, unit: string, comment: string) => void;
  initialValue?: string;
  initialUnit?: string;
  initialComment?: string;
  title?: string;
}

const UNIT_SYSTEMS = {
  imperial: ["ft", "in", "ft-in", "yd"],
  metric: ["m", "cm", "mm"],
  symbols: ["'", '"', "°"],
};

export function DimensionDialog({ 
  open, 
  onOpenChange, 
  onConfirm, 
  initialValue = "", 
  initialUnit = "in",
  initialComment = "",
  title = "Add Dimension"
}: DimensionDialogProps) {
  const [value, setValue] = useState(initialValue);
  const [comment, setComment] = useState(initialComment);
  const [system, setSystem] = useState<"imperial" | "metric" | "symbols">(() => {
    if (["m", "cm", "mm"].includes(initialUnit)) return "metric";
    if (["'", '"', "°"].includes(initialUnit)) return "symbols";
    return "imperial";
  });
  const [unit, setUnit] = useState(initialUnit);

  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setValue(initialValue);
    setUnit(initialUnit);
    setComment(initialComment);
    if (["m", "cm", "mm"].includes(initialUnit)) {
      setSystem("metric");
    } else if (["'", '"', "°"].includes(initialUnit)) {
      setSystem("symbols");
    } else {
      setSystem("imperial");
    }
  }
  if (open !== prevOpen) {
    setPrevOpen(open);
  }

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value, unit, comment);
      setValue("");
      setComment("");
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    setValue("");
    setComment("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Enter the measurement value and select units
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center gap-3">
            <Label htmlFor="measure" className="w-20">
              Measure:
            </Label>
            <Input
              id="measure"
              type="text"
              inputMode="decimal"
              placeholder="e.g., 24"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="flex-1"
              autoFocus
              data-testid="input-dimension-value"
            />
            <span className="text-sm text-muted-foreground w-10">{unit}</span>
          </div>

          <div className="flex items-center gap-3">
            <Label htmlFor="comment" className="w-20">
              Comment:
            </Label>
            <Input
              id="comment"
              type="text"
              placeholder="Optional note"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="flex-1"
              data-testid="input-dimension-comment"
            />
          </div>

          <div className="space-y-2">
            <ToggleGroup
              type="single"
              value={system}
              onValueChange={(val) => {
                if (val) {
                  setSystem(val as "imperial" | "metric" | "symbols");
                  setUnit(UNIT_SYSTEMS[val as keyof typeof UNIT_SYSTEMS][0]);
                }
              }}
              className="justify-start"
            >
              <ToggleGroupItem value="imperial" data-testid="toggle-imperial">
                Imperial
              </ToggleGroupItem>
              <ToggleGroupItem value="metric" data-testid="toggle-metric">
                Metric
              </ToggleGroupItem>
              <ToggleGroupItem value="symbols" data-testid="toggle-symbols">
                Symbols
              </ToggleGroupItem>
            </ToggleGroup>

            <ToggleGroup
              type="single"
              value={unit}
              onValueChange={(val) => val && setUnit(val)}
              className="justify-start flex-wrap"
            >
              {UNIT_SYSTEMS[system].map((u) => (
                <ToggleGroupItem key={u} value={u} data-testid={`toggle-unit-${u}`}>
                  {u}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="secondary" onClick={handleCancel} data-testid="button-dimension-cancel">
            Cancel
          </Button>
          <Button onClick={handleConfirm} data-testid="button-dimension-confirm">
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
