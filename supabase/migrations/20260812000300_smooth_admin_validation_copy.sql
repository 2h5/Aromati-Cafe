-- Keep database validation feedback aligned with the clearer wording in the CMS.
-- Only the messages change; the validation rules remain identical.

create or replace function public.check_setting_format()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v text := btrim(new.value);
begin
  if new.key = 'phone_digits' and v !~ '^[0-9]{10}$' then
    raise exception 'The phone number needs exactly 10 digits with no spaces, brackets or dashes. For (332) 207-3847 enter 3322073847.';
  end if;

  if new.key = 'phone_country' and v !~ '^[0-9]{1,3}$' then
    raise exception 'The country code should be 1 to 3 digits. For the United States enter 1.';
  end if;

  if new.key = 'email' and v !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That does not look like an email address. It needs an @ and a dot after it, for example info@aromatinyc.com.';
  end if;

  if new.key = 'instagram_handle' then
    if v ~ '^@' then
      raise exception 'Leave the @ off the Instagram handle. Enter aromatinyc, not @aromatinyc. The site adds the @ where it shows one.';
    end if;
    if v !~ '^[A-Za-z0-9._]{1,30}$' then
      raise exception 'An Instagram handle can only use letters, numbers, dots and underscores.';
    end if;
  end if;

  if new.key ~ '^order_[a-z0-9]+_url$' and length(v) > 0 and v !~ '^https://' then
    raise exception 'Paste the full ordering link from the address bar. It must start with https://. To remove the service from the site, clear this field instead.';
  end if;

  if new.key = 'address_region' and v !~ '^[A-Z]{2}$' then
    raise exception 'The state should be its two-letter abbreviation in capitals, for example NY.';
  end if;

  if new.key = 'address_postal' and v !~ '^[0-9]{5}(-[0-9]{4})?$' then
    raise exception 'The ZIP code should be 5 digits, for example 10016.';
  end if;

  if new.is_editable and length(v) = 0 and new.key !~ '^order_[a-z0-9]+_url$' then
    raise exception 'The field "%" cannot be left empty because it appears on every page.', new.label;
  end if;

  return new;
end;
$$;
