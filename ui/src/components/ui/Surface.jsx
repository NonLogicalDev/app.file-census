import {
  modalHelpClassName,
  modalSurfaceClassName,
  segmentedTabClassName,
  segmentedTabsClassName
} from './surfaceClasses.js';
import { cn } from './cn.js';

export function ModalSurface({ as: Component = 'section', size = 'default', className, ...props }) {
  return <Component className={modalSurfaceClassName({ size, className })} {...props} />;
}

export function ModalHelp({ className, ...props }) {
  return <p className={cn(modalHelpClassName, className)} {...props} />;
}

export function SegmentedTabs({ className, ...props }) {
  return <div className={cn(segmentedTabsClassName, className)} {...props} />;
}

export function SegmentedTab({ active = false, className, ...props }) {
  return <button className={segmentedTabClassName({ active, className })} {...props} />;
}
