import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  SPEC_UNITS,
  MIN_SALE_UNITS,
  type FileDto,
  type ItemStatus,
  type MinSaleUnit,
  type SpecUnit,
} from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { refreshAfterWrite } from '../../api/queryClient';
import {
  createItem,
  getItem,
  listItemCategories,
  replaceItemImages,
  updateItem,
} from '../../api/items';
import { ImageUpload } from '../../components/ImageUpload';
import { ScannerDialog } from '../../components/ScannerDialog';
import { BundleEditor } from './BundleEditor';
import { isGtin } from '../../lib/gtin';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { Combobox } from '../../ui/combobox';
import { Field } from '../../ui/field';
import { Input } from '../../ui/input';
import { PageHeader } from '../../ui/page-header';
import { Select } from '../../ui/select';
import { Spinner } from '../../ui/spinner';
import { Textarea } from '../../ui/textarea';

interface FormState {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  description: string;
  specUnit: SpecUnit;
  innerUnit: SpecUnit | '';
  innerCount: string;
  minSaleUnit: MinSaleUnit;
  isPerishable: boolean;
  status: ItemStatus;
}

const EMPTY_FORM: FormState = {
  name: '',
  sku: '',
  barcode: '',
  category: '',
  description: '',
  specUnit: 'PIECE',
  innerUnit: '',
  innerCount: '',
  minSaleUnit: 'SPEC',
  isPerishable: false,
  status: 'ACTIVE',
};

// 条码输入行是「输入框 + 扫码按钮」的组合，Field 只能包单个控件，
// 所以这一行按 Field 的排版自己接线 label / aria-describedby / role="alert"。
const BARCODE_INPUT_ID = 'item-barcode';
const BARCODE_ERROR_ID = 'item-barcode-error';

// 物品新建/编辑表单。图片经 ImageUpload 先压缩上传，新建时随物品提交，
// 编辑时保存图片关联的完整集合。
export function ItemFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const isEdit = Boolean(params.id);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [files, setFiles] = useState<FileDto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  // 条码错误只在用户离开输入框或提交被拒后才显示（不在首个渲染就标红）。
  const [barcodeInteracted, setBarcodeInteracted] = useState(false);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['items', params.id],
    queryFn: () => getItem(params.id!),
    enabled: isEdit,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['items', 'categories'],
    queryFn: listItemCategories,
  });

  useEffect(() => {
    if (!detail) return;
    setForm({
      name: detail.name,
      sku: detail.sku ?? '',
      barcode: detail.barcode ?? '',
      category: detail.category ?? '',
      description: detail.description ?? '',
      specUnit: detail.specUnit,
      innerUnit: detail.innerUnit ?? '',
      innerCount: detail.innerCount ?? '',
      minSaleUnit: detail.minSaleUnit,
      isPerishable: detail.isPerishable,
      status: detail.status,
    });
    setFiles(detail.images.map((image) => image.file!).filter(Boolean));
    setBarcodeInteracted(false);
  }, [detail]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleScan = useCallback((code: string) => {
    setScanOpen(false);
    setForm((prev) => ({ ...prev, barcode: code }));
  }, []);

  const submit = async () => {
    if (!form.name.trim()) return;
    if (form.barcode.trim() && !isGtin(form.barcode.trim())) {
      setBarcodeInteracted(true);
      setError(t('items.barcodeInvalid'));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        const id = params.id!;
        await updateItem(id, {
          name: form.name,
          sku: form.sku.trim() || null,
          barcode: form.barcode.trim() || null,
          category: form.category.trim() || null,
          description: form.description.trim() || null,
          specUnit: form.specUnit,
          innerUnit: form.innerUnit || null,
          innerCount: form.innerCount.trim() ? form.innerCount.trim() : null,
          minSaleUnit: form.minSaleUnit,
          isPerishable: form.isPerishable,
          status: form.status,
        });
        await replaceItemImages(id, files.map((file) => file.id));
        void refreshAfterWrite(queryClient);
        navigate(`/items/${id}`);
      } else {
        const detail = await createItem({
          name: form.name,
          sku: form.sku.trim() || undefined,
          barcode: form.barcode.trim() || undefined,
          category: form.category.trim() || undefined,
          description: form.description.trim() || undefined,
          specUnit: form.specUnit,
          innerUnit: form.innerUnit || undefined,
          innerCount: form.innerCount.trim() || undefined,
          minSaleUnit: form.minSaleUnit,
          isPerishable: form.isPerishable,
          status: form.status,
          fileIds: files.map((file) => file.id),
        });
        void refreshAfterWrite(queryClient);
        navigate(`/items/${detail.id}`);
      }
    } catch (cause) {
      setError(isApiError(cause) ? t(errorI18nKey(cause.code)) : t('errors.UNKNOWN'));
      setSaving(false);
    }
  };

  useEffect(() => {
    if (isEdit) return;
    setForm(EMPTY_FORM);
    setFiles([]);
  }, [isEdit]);

  if (isEdit && isLoading) {
    return <Spinner label={t('common.loading')} />;
  }

  const barcodeInvalid =
    barcodeInteracted && form.barcode.trim() !== '' && !isGtin(form.barcode.trim());

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <PageHeader title={isEdit ? t('items.editTitle') : t('items.createTitle')} />

      {error && (
        <p role="alert" className="text-sm text-danger-600">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <Field label={t('items.name')} required>
          <Input value={form.name} onChange={(event) => set('name', event.target.value)} />
        </Field>
        <Field label={t('items.sku')}>
          <Input value={form.sku} onChange={(event) => set('sku', event.target.value)} />
        </Field>

        {/* 条码：输入框 + 扫码按钮同一行，错误文案挂在输入框下方（不挤动按钮）。 */}
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={BARCODE_INPUT_ID} className="text-sm font-medium text-ink-soft">
            {t('items.barcode')}
          </label>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <Input
                id={BARCODE_INPUT_ID}
                value={form.barcode}
                maxLength={14}
                inputMode="numeric"
                aria-invalid={barcodeInvalid || undefined}
                aria-describedby={barcodeInvalid ? BARCODE_ERROR_ID : undefined}
                onBlur={() => setBarcodeInteracted(true)}
                onChange={(event) => set('barcode', event.target.value.replace(/\D/g, ''))}
              />
              {barcodeInvalid && (
                <p
                  id={BARCODE_ERROR_ID}
                  role="alert"
                  className="mt-1.5 text-xs font-medium text-danger-600"
                >
                  {t('items.barcodeInvalid')}
                </p>
              )}
            </div>
            <Button variant="secondary" className="shrink-0" onClick={() => setScanOpen(true)}>
              {t('items.scan')}
            </Button>
          </div>
        </div>

        <Field label={t('items.category')}>
          <Combobox
            value={form.category}
            onValueChange={(value) => set('category', value)}
            options={categories.map((category) => ({ value: category, label: category }))}
            onSelect={(option) => set('category', option.value)}
            placeholder={t('items.categoryPlaceholder')}
            emptyText={t('items.categoryPlaceholder')}
            aria-label={t('items.category')}
            className="min-w-0"
          />
        </Field>

        <Field label={t('items.specUnit')}>
          <Select
            value={form.specUnit}
            onValueChange={(value) => set('specUnit', value as SpecUnit)}
          >
            {SPEC_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t(`items.specUnits.${unit}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('items.innerUnit')}>
          <Select
            value={form.innerUnit}
            onValueChange={(value) => {
              const unit = value as SpecUnit | '';
              set('innerUnit', unit);
              if (!unit && form.minSaleUnit === 'INNER') set('minSaleUnit', 'SPEC');
            }}
          >
            <option value="">—</option>
            {SPEC_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t(`items.innerUnits.${unit}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('items.innerCount')}>
          <Input
            value={form.innerCount}
            onChange={(event) => set('innerCount', event.target.value)}
          />
        </Field>

        <Field label={t('items.minSaleUnit')}>
          <Select
            value={form.minSaleUnit}
            onValueChange={(value) => set('minSaleUnit', value as MinSaleUnit)}
          >
            {MIN_SALE_UNITS.map((unit) => (
              <option key={unit} value={unit} disabled={unit === 'INNER' && !form.innerUnit}>
                {t(`items.minSaleUnits.${unit}`)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('items.status')}>
          <Select
            value={form.status}
            onValueChange={(value) => set('status', value as ItemStatus)}
          >
            <option value="ACTIVE">{t('items.statusActive')}</option>
            <option value="INACTIVE">{t('items.statusInactive')}</option>
          </Select>
        </Field>

        <div className="flex items-center sm:col-span-2">
          <Checkbox
            id="item-perishable"
            checked={form.isPerishable}
            onChange={(event) => set('isPerishable', event.currentTarget.checked)}
            label={t('items.isPerishable')}
          />
        </div>

        <Field label={t('items.description')} className="sm:col-span-2">
          <Textarea
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            rows={3}
          />
        </Field>
      </div>

      <Field label={t('items.images')} unlabeled>
        <ImageUpload value={files} onChange={setFiles} />
      </Field>

      {isEdit && detail && <BundleEditor itemId={detail.id} initial={detail.bundleComponents} />}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          loading={saving}
          disabled={!form.name.trim()}
          onClick={() => void submit()}
        >
          {t('items.save')}
        </Button>
        <Button asChild variant="secondary">
          <Link
            to={isEdit ? `/items/${params.id}` : '/items'}
            aria-disabled={saving || undefined}
            className={saving ? 'pointer-events-none opacity-50' : undefined}
          >
            {t('items.cancel')}
          </Link>
        </Button>
      </div>

      <ScannerDialog open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />
    </div>
  );
}
