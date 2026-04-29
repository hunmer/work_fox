import { h, ref } from 'vue'
import { DialogRoot, DialogPortal } from 'reka-ui'
import DialogOverlay from '@/components/ui/dialog/DialogOverlay.vue'
import DialogContent from '@/components/ui/dialog/DialogContent.vue'
import DialogHeader from '@/components/ui/dialog/DialogHeader.vue'
import DialogTitle from '@/components/ui/dialog/DialogTitle.vue'
import DialogDescription from '@/components/ui/dialog/DialogDescription.vue'
import DialogFooter from '@/components/ui/dialog/DialogFooter.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

// ---- Types ----

export interface AlertDialogOptions {
  title?: string
  message: string
  confirmText?: string
}

export interface PromptDialogOptions {
  title?: string
  message?: string
  placeholder?: string
  defaultValue?: string
  confirmText?: string
  cancelText?: string
}

export interface FormItem {
  id: string
  title: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'password'
  data?: {
    value?: any
    placeholder?: string
    options?: Array<{ label: string; value: any }>
    min?: number
    max?: number
  }
}

export interface FormDialogOptions {
  title?: string
  items: FormItem[]
  confirmText?: string
  cancelText?: string
}

// ---- Queue ----

type PendingDialog = {
  id: number
  component: any
  props: Record<string, any>
  resolve: (value: any) => void
}

const queue = ref<PendingDialog[]>([])
let nextId = 0

function enqueue(component: any, props: Record<string, any>): Promise<any> {
  return new Promise((resolve) => {
    queue.value.push({ id: nextId++, component, props, resolve })
  })
}

function resolveDialog(item: PendingDialog, value: any) {
  item.resolve(value)
  const idx = queue.value.indexOf(item)
  if (idx >= 0) queue.value.splice(idx, 1)
}

// ---- Static API ----

export const dialog = {
  alert(options: AlertDialogOptions): Promise<void> {
    return enqueue(AlertDialogView, {
      title: options.title || '提示',
      message: options.message,
      confirmText: options.confirmText || '确定',
    }).then(() => {})
  },

  prompt(options: PromptDialogOptions): Promise<string | null> {
    return enqueue(PromptDialogView, {
      title: options.title || '输入',
      message: options.message || '',
      placeholder: options.placeholder || '',
      defaultValue: options.defaultValue || '',
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
    })
  },

  form(options: FormDialogOptions): Promise<Record<string, any> | null> {
    return enqueue(FormDialogView, {
      title: options.title || '表单',
      items: options.items,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
    })
  },
}

// ---- Host Component ----

export const DialogHost = {
  name: 'DialogHost',
  setup() {
    return () =>
      queue.value.map((item) =>
        h(item.component, {
          key: item.id,
          ...item.props,
          onResolve: (val: any) => resolveDialog(item, val),
          onCancel: () => resolveDialog(item, null),
        }),
      )
  },
}

// ---- Alert Dialog ----

const AlertDialogView = {
  name: 'AlertDialogView',
  props: {
    title: { type: String, default: '提示' },
    message: { type: String, default: '' },
    confirmText: { type: String, default: '确定' },
  },
  emits: ['resolve'],
  setup(props: any, { emit }: any) {
    return () =>
      h(DialogRoot, { open: true, 'onUpdate:open': (v: boolean) => { if (!v) emit('resolve') } }, () =>
        h(DialogPortal, () => [
          h(DialogOverlay),
          h(DialogContent, { class: 'sm:max-w-md' }, () => [
            h(DialogHeader, () => [
              h(DialogTitle, () => props.title),
              props.message ? h(DialogDescription, () => props.message) : null,
            ]),
            h(DialogFooter, () => [
              h(Button, { onClick: () => emit('resolve') }, () => props.confirmText),
            ]),
          ]),
        ]),
      )
  },
}

// ---- Prompt Dialog ----

const PromptDialogView = {
  name: 'PromptDialogView',
  props: {
    title: { type: String, default: '输入' },
    message: { type: String, default: '' },
    placeholder: { type: String, default: '' },
    defaultValue: { type: String, default: '' },
    confirmText: { type: String, default: '确定' },
    cancelText: { type: String, default: '取消' },
  },
  emits: ['resolve', 'cancel'],
  setup(props: any, { emit }: any) {
    const inputValue = ref(props.defaultValue)
    return () =>
      h(DialogRoot, { open: true, 'onUpdate:open': (v: boolean) => { if (!v) emit('cancel') } }, () =>
        h(DialogPortal, () => [
          h(DialogOverlay),
          h(DialogContent, { class: 'sm:max-w-md' }, () => [
            h(DialogHeader, () => [
              h(DialogTitle, () => props.title),
              props.message ? h(DialogDescription, () => props.message) : null,
            ]),
            h(Input, {
              modelValue: inputValue.value,
              'onUpdate:modelValue': (v: string) => { inputValue.value = v },
              placeholder: props.placeholder,
              onKeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') emit('resolve', inputValue.value) },
            }),
            h(DialogFooter, { class: 'flex justify-end gap-2' }, () => [
              h(Button, { variant: 'outline', onClick: () => emit('cancel') }, () => props.cancelText),
              h(Button, { onClick: () => emit('resolve', inputValue.value) }, () => props.confirmText),
            ]),
          ]),
        ]),
      )
  },
}

// ---- Form Dialog ----

const FormDialogView = {
  name: 'FormDialogView',
  props: {
    title: { type: String, default: '表单' },
    items: { type: Array, default: () => [] },
    confirmText: { type: String, default: '确定' },
    cancelText: { type: String, default: '取消' },
  },
  emits: ['resolve', 'cancel'],
  setup(props: any, { emit }: any) {
    const formData = ref<Record<string, any>>({})
    for (const item of props.items as FormItem[]) {
      formData.value[item.id] = item.data?.value ?? (item.type === 'checkbox' ? false : '')
    }

    const renderField = (item: FormItem) => {
      switch (item.type) {
        case 'textarea':
          return h(Textarea, {
            modelValue: formData.value[item.id],
            'onUpdate:modelValue': (v: string) => { formData.value[item.id] = v },
            placeholder: item.data?.placeholder || '',
            class: 'min-h-[80px]',
          })
        case 'number':
          return h(Input, {
            type: 'number',
            modelValue: formData.value[item.id],
            'onUpdate:modelValue': (v: string) => { formData.value[item.id] = v === '' ? '' : Number(v) },
            placeholder: item.data?.placeholder || '',
            min: item.data?.min,
            max: item.data?.max,
          })
        case 'password':
          return h(Input, {
            type: 'password',
            modelValue: formData.value[item.id],
            'onUpdate:modelValue': (v: string) => { formData.value[item.id] = v },
            placeholder: item.data?.placeholder || '',
          })
        case 'select':
          return h(Select, {
            modelValue: formData.value[item.id],
            'onUpdate:modelValue': (v: any) => { formData.value[item.id] = v },
          }, () => [
            h(SelectTrigger, { class: 'w-full' }, () => [
              h(SelectValue, { placeholder: item.data?.placeholder || '请选择' }),
            ]),
            h(SelectContent, () => (item.data?.options || []).map((opt: any) =>
              h(SelectItem, { key: opt.value, value: opt.value }, () => opt.label),
            )),
          ])
        case 'checkbox':
          return h('div', { class: 'flex items-center gap-2' }, [
            h(Checkbox, {
              checked: !!formData.value[item.id],
              'onUpdate:checked': (v: boolean) => { formData.value[item.id] = v },
            }),
          ])
        default:
          return h(Input, {
            modelValue: formData.value[item.id],
            'onUpdate:modelValue': (v: string) => { formData.value[item.id] = v },
            placeholder: item.data?.placeholder || '',
          })
      }
    }

    return () => {
      const items = props.items as FormItem[]
      const fields = items.map((item) =>
        h('div', { class: 'space-y-1.5' }, [
          h(Label, { class: 'text-sm font-medium' }, () => item.title),
          renderField(item),
        ]),
      )

      return h(DialogRoot, { open: true, 'onUpdate:open': (v: boolean) => { if (!v) emit('cancel') } }, () =>
        h(DialogPortal, () => [
          h(DialogOverlay),
          h(DialogContent, { class: 'sm:max-w-lg' }, () => [
            h(DialogHeader, () => [
              h(DialogTitle, () => props.title),
            ]),
            h('div', { class: 'space-y-4 max-h-[60vh] overflow-y-auto py-2' }, fields),
            h(DialogFooter, { class: 'flex justify-end gap-2' }, () => [
              h(Button, { variant: 'outline', onClick: () => emit('cancel') }, () => props.cancelText),
              h(Button, { onClick: () => emit('resolve', { ...formData.value }) }, () => props.confirmText),
            ]),
          ]),
        ]),
      )
    }
  },
}
