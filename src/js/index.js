import Forms from "./modules/components/forms";
import "./modules/index";
import { handlePopUp } from "./modules/utils";

// Add remaining properties to window object
Object.assign(window, {
  handlePopUp,
});

Forms();
