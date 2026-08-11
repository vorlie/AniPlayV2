import { Minus, Plus } from "lucide-react";

interface NumberStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
}

export function NumberStepper({
  label,
  value,
  onChange,
  max,
}: NumberStepperProps) {
  const update = (next: number) =>
    onChange(Math.max(0, max === undefined ? next : Math.min(max, next)));
  return (
    <div className="home-stepper">
      <span className="home-stepper-label">{label}</span>
      <div className="home-stepper-inputs">
        <button
          type="button"
          onClick={() => update(value - 1)}
          disabled={value <= 0}
          className="home-stepper-button"
          aria-label={`${label} -1`}
        >
          <Minus size={15} />
        </button>
        <input
          type="number"
          min="0"
          max={max}
          value={value}
          onChange={(event) => update(Number(event.target.value) || 0)}
          className="home-stepper-input"
          aria-label={label}
        />
        <button
          type="button"
          onClick={() => update(value + 1)}
          disabled={max !== undefined && value >= max}
          className="home-stepper-button"
          aria-label={`${label} +1`}
        >
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
