-- Deliberately no fake accounts, groups or projects.
-- The canonical scientific vocabulary is versioned with the schema migration.

-- Raúl LOCAL DEMO FIXTURES (supabase db reset only). Facts were checked against
-- official sources on 2026-10-17. These rows are not evidence of a live ingest.

do $$
declare v_data jsonb; v_row record; v_id uuid; v_hash text;
begin
  for v_row in
    select * from (values
      ('imdea_energy_2027','internships-2027',jsonb_build_object(
        'opportunity_type','research_internship','title','30 prácticas de investigación IMDEA Energía 2027',
        'provider','IMDEA Energía','summary','Prácticas remuneradas de investigación para estudiantes de Grado y Máster.',
        'official_url','https://energia.imdea.org/en/imdea-energy-launches-30-internships-for-bachelors-and-masters-students-in-2027/',
        'application_url',null,'bases_url','https://www.ucm.es/bbmbiomed/file/programa-praticas-imdea-energia-2027?ver=',
        'country','España','opens_at',null,'official_deadline_date','2026-11-07','official_deadline_at',null,
        'internal_deadline_at',null,'status','open','checked_at',now(),
        'provenance',jsonb_build_object('source_url','https://energia.imdea.org/en/imdea-energy-launches-30-internships-for-bachelors-and-masters-students-in-2027/','parser_version','seed-2026-10-17','seed_fixture',true),
        'scholarship_details',jsonb_build_object('academic_stages',jsonb_build_array('bachelor','master'),
          'degree_areas',jsonb_build_array(),'residence_requirement',jsonb_build_object('state','confirmed','value','Permiso de residencia en España durante las prácticas'),
          'amount',jsonb_build_object('state','confirmed','value','Hasta 2.200 € Grado / 2.500 € Máster'),
          'requirements',jsonb_build_array(
            jsonb_build_object('key','enrollment','label','Matrícula en Grado o Máster','state','confirmed','value',true,'source_url','https://energia.imdea.org/en/imdea-energy-launches-30-internships-for-bachelors-and-masters-students-in-2027/'),
            jsonb_build_object('key','residence','label','Permiso de residencia en España durante las prácticas','state','confirmed','value',true,'source_url','https://energia.imdea.org/en/imdea-energy-launches-30-internships-for-bachelors-and-masters-students-in-2027/')),
          'missing_information',jsonb_build_array('Área concreta de cada plaza','URL directa de solicitud')))),
      ('upm_metrologia_2026','url:https://minasyenergia.upm.es/la-escuela/ultimas-noticias/noticias-estudiantes/noticias-becas-y-ayudas/beca-metrologia-y-analisis-de-datos-en-las-areas-de-volumen-y-temperatura',jsonb_build_object(
        'opportunity_type','scholarship','title','Beca de metrología y análisis de datos: volumen y temperatura',
        'provider','Universidad Politécnica de Madrid','summary','Beca de investigación en metrología y análisis de datos para estudiantes de ingeniería.',
        'official_url','https://minasyenergia.upm.es/la-escuela/ultimas-noticias/noticias-estudiantes/noticias-becas-y-ayudas/beca-metrologia-y-analisis-de-datos-en-las-areas-de-volumen-y-temperatura',
        'application_url',null,'bases_url',null,'country','España','opens_at',null,
        'official_deadline_date','2026-10-26','official_deadline_at','2026-10-26T12:00:00Z',
        'internal_deadline_at',null,'status','open','checked_at',now(),
        'provenance',jsonb_build_object('source_url','https://minasyenergia.upm.es/la-escuela/ultimas-noticias/noticias-estudiantes/noticias-becas-y-ayudas/beca-metrologia-y-analisis-de-datos-en-las-areas-de-volumen-y-temperatura','parser_version','seed-2026-10-17','seed_fixture',true),
        'scholarship_details',jsonb_build_object('academic_stages',jsonb_build_array('bachelor'),
          'degree_areas',jsonb_build_array('Ingeniería'),'residence_requirement',jsonb_build_object('state','unknown','value',null),
          'amount',jsonb_build_object('state','confirmed','value','300 € brutos/mes'),
          'requirements',jsonb_build_array(jsonb_build_object('key','academic_stage','label','Estudiante de Grado en ingeniería','state','confirmed','value',true,'source_url','https://minasyenergia.upm.es/la-escuela/ultimas-noticias/noticias-estudiantes/noticias-becas-y-ayudas/beca-metrologia-y-analisis-de-datos-en-las-areas-de-volumen-y-temperatura')),
          'missing_information',jsonb_build_array('Residencia exigida','URL directa de solicitud')))),
      ('rtve_tfm_2026','ix-impulsa-vision-tfm-2026',jsonb_build_object(
        'opportunity_type','scholarship','title','IX Ayudas Impulsa Visión RTVE a la investigación de TFM',
        'provider','RTVE','summary','Ayudas para investigación vinculada a TFM del curso 2026/27.',
        'official_url','https://www.rtve.es/rtve/20261006/convocatoria-impulsa-vision-rtve-ayudas-investigacion-oficiales-tfm/17254848.shtml',
        'application_url',null,'bases_url','https://static.rtve.es/resources/pdf/2/1/4/2/01791277132412.pdf',
        'country','España','opens_at',null,'official_deadline_date','2026-12-16','official_deadline_at',null,
        'internal_deadline_at',null,'status','open','checked_at',now(),
        'provenance',jsonb_build_object('source_url','https://www.rtve.es/rtve/20261006/convocatoria-impulsa-vision-rtve-ayudas-investigacion-oficiales-tfm/17254848.shtml','parser_version','seed-2026-10-17','seed_fixture',true),
        'scholarship_details',jsonb_build_object('academic_stages',jsonb_build_array('master'),
          'degree_areas',jsonb_build_array(),'residence_requirement',jsonb_build_object('state','unknown','value',null),
          'amount',jsonb_build_object('state','confirmed','value','8.000 € estudiante / 4.000 € centro'),
          'requirements',jsonb_build_array(jsonb_build_object('key','tfm','label','TFM en máster oficial de universidad española, curso 2026/27','state','confirmed','value',true,'source_url','https://www.rtve.es/rtve/20261006/convocatoria-impulsa-vision-rtve-ayudas-investigacion-oficiales-tfm/17254848.shtml')),
          'missing_information',jsonb_build_array('Residencia exigida','URL directa de solicitud'))))
    ) as seeded(source_id,external_id,data)
  loop
    v_data:=v_row.data;
    v_hash:=encode(sha256(convert_to((v_data-'checked_at')::text,'UTF8')),'hex');
    insert into public.opportunities(source_id,external_id,opportunity_type,title,provider,summary,
      official_url,application_url,bases_url,country,opens_at,official_deadline_date,official_deadline_at,
      internal_deadline_at,status,checked_at,content_hash,content_version,provenance)
    values(v_row.source_id,v_row.external_id,v_data->>'opportunity_type',v_data->>'title',v_data->>'provider',
      v_data->>'summary',v_data->>'official_url',v_data->>'application_url',v_data->>'bases_url',
      v_data->>'country',null,(v_data->>'official_deadline_date')::date,
      (v_data->>'official_deadline_at')::timestamptz,null,'open',
      (v_data->>'checked_at')::timestamptz,v_hash,1,v_data->'provenance')
    on conflict(source_id,external_id) do nothing returning id into v_id;
    if v_id is null then continue; end if;
    insert into public.scholarship_details(opportunity_id,academic_stages,degree_areas,
      residence_requirement,amount,requirements,missing_information)
    values(v_id,array(select jsonb_array_elements_text(v_data->'scholarship_details'->'academic_stages')),
      array(select jsonb_array_elements_text(v_data->'scholarship_details'->'degree_areas')),
      v_data->'scholarship_details'->'residence_requirement',v_data->'scholarship_details'->'amount',
      v_data->'scholarship_details'->'requirements',
      array(select jsonb_array_elements_text(v_data->'scholarship_details'->'missing_information')));
    insert into public.opportunity_versions(opportunity_id,version,content_hash,snapshot,checked_at)
      values(v_id,1,v_hash,v_data,(v_data->>'checked_at')::timestamptz);
  end loop;
end;
$$;
