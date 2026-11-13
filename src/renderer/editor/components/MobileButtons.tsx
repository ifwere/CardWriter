// Touch-sized navigation buttons (`Doc.UI.viewMobileButtons`).
//
// Hidden on desktop by CSS (`#mobile-buttons { display: none }`) but kept so the
// narrow-window layout matches the original.

import { useDocument } from "../state/documentStore.ts";
import {
  CaretDownOutlined,
  CaretLeftOutlined,
  CaretRightOutlined,
  CaretUpOutlined,
  CheckOutlined,
  EditOutlined,
  PlusSquareOutlined,
  StopOutlined
} from "./icons.tsx";

export function MobileButtons() {
  const viewMode = useDocument((state) => state.viewMode);
  const isEditing = viewMode !== "normal";

  const saveAndCloseCard = useDocument((state) => state.saveAndCloseCard);
  const openCard = useDocument((state) => state.openCard);
  const insertBelow = useDocument((state) => state.insertBelow);
  const insertAbove = useDocument((state) => state.insertAbove);
  const insertChild = useDocument((state) => state.insertChild);
  const goLeft = useDocument((state) => state.goLeft);
  const goRight = useDocument((state) => state.goRight);
  const goUp = useDocument((state) => state.goUp);
  const goDown = useDocument((state) => state.goDown);
  const active = useDocument((state) => state.active);

  if (isEditing) {
    return (
      <div id="mobile-buttons" className="footer">
        <span id="mbtn-cancel" className="mobile-button" onClick={saveAndCloseCard}>
          <StopOutlined width={18} />
        </span>
        <span id="mbtn-save" className="mobile-button" onClick={saveAndCloseCard}>
          <CheckOutlined width={18} />
        </span>
      </div>
    );
  }

  return (
    <div id="mobile-buttons" className="footer">
      <span id="mbtn-edit" className="mobile-button" onClick={() => openCard(active)}>
        <EditOutlined width={18} />
      </span>
      <span id="mbtn-add-right" className="mobile-button" onClick={() => insertChild(active)}>
        <PlusSquareOutlined width={18} />
        <CaretRightOutlined width={14} />
      </span>
      <span id="mbtn-add-down" className="mobile-button" onClick={() => insertBelow(active)}>
        <PlusSquareOutlined width={18} />
        <CaretDownOutlined width={14} />
      </span>
      <span id="mbtn-add-up" className="mobile-button" onClick={() => insertAbove(active)}>
        <PlusSquareOutlined width={18} />
        <CaretUpOutlined width={14} />
      </span>
      <span id="mbtn-nav-left" className="mobile-button" onClick={goLeft}>
        <CaretLeftOutlined width={18} />
      </span>
      <span id="mbtn-nav-up" className="mobile-button" onClick={goUp}>
        <CaretUpOutlined width={18} />
      </span>
      <span id="mbtn-nav-down" className="mobile-button" onClick={goDown}>
        <CaretDownOutlined width={18} />
      </span>
      <span id="mbtn-nav-right" className="mobile-button" onClick={goRight}>
        <CaretRightOutlined width={18} />
      </span>
    </div>
  );
}
