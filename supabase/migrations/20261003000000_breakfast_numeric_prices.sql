-- Guard new writes without rejecting deployment over a legacy invalid price.
-- Existing invalid rows remain visible in the editor for correction. The public
-- reader ignores invalid choices instead of producing a NaN ticket.
alter table public.menu_builder_options
  add constraint menu_builder_price_decimal
  check (group_key = 'bagel' or
         btrim(price) ~ '^(?:[0-9]+(?:\.[0-9]{1,2})?|\.[0-9]{1,2})$')
  not valid;
