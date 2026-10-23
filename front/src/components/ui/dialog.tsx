import type { ComponentProps } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '../../lib/utils'
export const Dialog = DialogPrimitive.Root
export const DialogTitle = DialogPrimitive.Title
export const DialogDescription = DialogPrimitive.Description
export const DialogClose = DialogPrimitive.Close
export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>) {
  return <DialogPrimitive.Portal><DialogPrimitive.Overlay className="bank-dialog-overlay" /><DialogPrimitive.Content className={cn('bank-dialog', className)} {...props}>{children}</DialogPrimitive.Content></DialogPrimitive.Portal>
}
