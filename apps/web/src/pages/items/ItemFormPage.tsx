import {
  Button,
  Checkbox,
  Field,
  Input,
  Select,
  Spinner,
  Text,
  Textarea,
  Title1,
} from '@fluentui/react-components';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  SPEC_UNITS,
  type FileDto,
  type ItemStatus,
  type SpecUnit,
} from '@otunlink/shared';

import { errorI18nKey, isApiError } from '../../api/http';
import { attachItemImages, createItem, getItem, updateItem } from '../../api/items';
import { ImageUpload } from '../../components/ImageUpload';
import { ScannerDialog } from '../../components/ScannerDialog';

interface FormState {
  name: string;
  sku: string;
  barcode: string;
  category: string;
  description: string;
  specUnit: SpecUnit;
  innerUnit: SpecUnit | '';
  innerCount: string;
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
  isPerishable: false,
  status: 'ACTIVE',
};

// 物品新建/编辑表单。图片经 ImageUpload 先压缩上传，新建时随物品提交，
// 编辑时在保存后补挂新增图片。
export function ItemFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const isEdit = Boolean(params.id);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [files, setFiles] = useState<FileDto[]>([]);
  const [initialFileIds, setInitialFileIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanOpen, setScanOpen] = useState(false);

  const { data: detail, isLoading } = useQuery({
    queryKey: ['items', params.id],
    queryFn: () => getItem(params.id!),
    enabled: isEdit,
    staleTime: 30_000,
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
      isPerishable: detail.isPerishable,
      status: detail.status,
    });
    setFiles(detail.images.map((image) => image.file!).filter(Boolean));
    setInitialFileIds(detail.images.map((image) => image.fileId));
  }, [detail]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleScan = useCallback((code: string) => {
    setScanOpen(false);
    setForm((prev) => ({ ...prev, barcode: code }));
  }, []);

  const submit = async () => {
    if (!form.name.trim()) return;
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
          isPerishable: form.isPerishable,
          status: form.status,
        });
        const newFiles = files.filter((file) => !initialFileIds.includes(file.id));
        if (newFiles.length > 0) {
          await attachItemImages(id, newFiles.map((file) => file.id));
        }
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
          isPerishable: form.isPerishable,
          status: form.status,
          fileIds: files.map((file) => file.id),
        });
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
    setInitialFileIds([]);
  }, [isEdit]);

  if (isEdit && isLoading) {
    return <Spinner label={t('common.loading')} />;
  }

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Title1 as="h1">{isEdit ? t('items.editTitle') : t('items.createTitle')}</Title1>

      {error && <Text className="text-red-600">{error}</Text>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t('items.name')} required>
          <Input value={form.name} onChange={(_, d) => set('name', d.value)} />
        </Field>
        <Field label={t('items.sku')}>
          <Input value={form.sku} onChange={(_, d) => set('sku', d.value)} />
        </Field>
        <Field label={t('items.barcode')}>
          <div className="flex gap-2">
            <Input value={form.barcode} onChange={(_, d) => set('barcode', d.value)} />
            <Button type="button" appearance="secondary" onClick={() => setScanOpen(true)}>
              {t('items.scan')}
            </Button>
          </div>
        </Field>
        <Field label={t('items.category')}>
          <Input value={form.category} onChange={(_, d) => set('category', d.value)} />
        </Field>
        <Field label={t('items.specUnit')}>
          <Select value={form.specUnit} onChange={(_, d) => set('specUnit', d.value as SpecUnit)}>
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
            onChange={(_, d) => set('innerUnit', d.value as SpecUnit | '')}
          >
            <option value="">—</option>
            {SPEC_UNITS.map((unit) => (
              <option key={unit} value={unit}>
                {t(`items.specUnits.${unit}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('items.innerCount')}>
          <Input value={form.innerCount} onChange={(_, d) => set('innerCount', d.value)} />
        </Field>
        <Field label={t('items.status')}>
          <Select value={form.status} onChange={(_, d) => set('status', d.value as ItemStatus)}>
            <option value="ACTIVE">{t('items.statusActive')}</option>
            <option value="INACTIVE">{t('items.statusInactive')}</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Checkbox
            checked={form.isPerishable}
            onChange={(_, d) => set('isPerishable', d.checked === true)}
            label={t('items.isPerishable')}
          />
        </div>
        <Field label={t('items.description')} className="sm:col-span-2">
          <Textarea
            value={form.description}
            onChange={(_, d) => set('description', d.value)}
            rows={3}
          />
        </Field>
      </div>

      <Field label={t('items.images')}>
        <ImageUpload value={files} onChange={setFiles} />
      </Field>

      <div className="flex items-center gap-3">
        <Button appearance="primary" disabled={saving || !form.name.trim()} onClick={() => void submit()}>
          {t('items.save')}
        </Button>
        <Link to={isEdit ? `/items/${params.id}` : '/items'}>
          <Button appearance="secondary" disabled={saving}>
            {t('items.cancel')}
          </Button>
        </Link>
      </div>

      <ScannerDialog open={scanOpen} onClose={() => setScanOpen(false)} onScan={handleScan} />
    </div>
  );
}
