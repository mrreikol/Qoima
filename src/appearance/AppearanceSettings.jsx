import { useId } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { Card } from "../components/ui";
import { useAppearance } from "./useAppearance";
import "./appearance.css";

const choices = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

export default function AppearanceSettings() {
  const id = useId();
  const { preference, resolvedTheme, storageAvailable, setPreference } =
    useAppearance();
  return (
    <Card className="settings-card appearance-card">
      <div className="card-heading">
        <div>
          <h2 id={`${id}-title`}>Appearance</h2>
          <p>Choose how Qoima looks on this browser.</p>
        </div>
      </div>
      <div className="appearance-body">
        <fieldset
          className="appearance-options"
          aria-describedby={`${id}-status`}
        >
          <legend className="visually-hidden">Color theme</legend>
          {choices.map(({ value, label, Icon }) => (
            <label className="appearance-option" key={value}>
              <input
                type="radio"
                name={`${id}-appearance`}
                value={value}
                checked={preference === value}
                onChange={() => setPreference(value)}
              />
              <span className="appearance-option-content">
                <Icon size={21} aria-hidden="true" />
                <span>{label}</span>
                <Check className="appearance-selected" size={16} aria-hidden="true" />
              </span>
            </label>
          ))}
        </fieldset>
        <p className="appearance-status" id={`${id}-status`} role="status">
          {preference === "system"
            ? `Follows your device. Currently ${resolvedTheme}.`
            : `${preference === "light" ? "Light" : "Dark"} theme selected.`}
          {" "}
          {storageAvailable
            ? "Applies to this browser only."
            : "This browser cannot save your choice. It will apply until you leave the page."}
        </p>
      </div>
    </Card>
  );
}
