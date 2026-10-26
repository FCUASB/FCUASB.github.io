-- Delta after catalog-setup.sql. No submission, contact or attachment rows are changed.
-- Stable IDs and ON CONFLICT preserve all existing edits and soft deletions on retry.
begin;
set local lock_timeout='5s';
alter table archive_private.catalog_entries drop constraint catalog_entries_kind_check;
alter table archive_private.catalog_entries add constraint catalog_entries_kind_check check(kind in ('concert','biography','memory'));
alter table archive_private.catalog_entries drop constraint catalog_entries_check;
alter table archive_private.catalog_entries add constraint catalog_entries_check check(
 (kind='biography' and entry_id='main' and deleted_at is null)
 or (kind in ('concert','memory') and entry_id ~ '^[1-9][0-9]{0,15}$'));
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','400001','{"id":400001,"n":"一位老同學的思念","story":"國小籃球場上並肩作戰的好隊友，國中管樂團裡一起練習的好夥伴，那些年少時的點點滴滴，永遠都是珍貴的回憶。\n老同學，辛苦了，一路好走，願你安息。","type":"text","y":null,"m":null,"source":"https://www.facebook.com/share/r/1CEzxVZWKK/","sourceName":"親友留言｜使用者提供的 Facebook 截圖","place":"一份思念","sourceNote":"依提供截圖摘錄。暫以文中關係稱呼，署名待核對；並非透過本網站投稿。","sample":false,"createdAt":2000000}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','400002','{"id":400002,"n":"一位高中樂團夥伴的思念","story":"大呂，從高中時期的長號獨奏比賽，到後來出國唸書回台灣常碰一起練樂團與演出，也共事了幾年的管樂教學，很高興在音樂路上遇見你這位知性、充滿求知的行動者，無論如何，相信你的家人與孩子們都會一如往昔愛你到永遠。❤️","type":"text","y":null,"m":null,"source":"https://www.facebook.com/share/r/1CEzxVZWKK/","sourceName":"親友留言｜使用者提供的 Facebook 截圖","place":"一份思念","sourceNote":"依提供截圖摘錄。暫以文中關係稱呼，署名待核對；並非透過本網站投稿。","sample":false,"createdAt":1999999}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300005','{"id":300005,"n":"FGO 冬日祭・專注的瞬間","asset":"fgo-3","y":2019,"m":12,"place":"","rel":"公開影像紀錄","story":"指揮與樂團之間，一個手勢引領下一個樂句。照片來自冬日祭演出報導。","source":"https://gnn.gamer.com.tw/detail.php?sn=190816","sourceName":"巴哈姆特 GNN","type":"photo","sample":false,"createdAt":1000000}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300001','{"id":300001,"n":"指揮台上的大呂","asset":"lu-early","y":null,"m":null,"place":"","rel":"公開影像紀錄","story":"逢甲大學校友管樂團官網的指揮介紹照，留下老師抬手帶領樂團的身影。","source":"https://fcuasb.wixsite.com/fcuasb/conduct","sourceName":"逢甲大學校友管樂團","type":"photo","sample":false,"createdAt":999999}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300016','{"id":300016,"n":"Blue Horizons・現場演出","asset":"yt-jhhfZr1vGr0","y":2024,"m":1,"place":"臺北國家音樂廳","rel":"公開影像紀錄","story":"切薩里尼《Blue Horizons》。原影片標示為 2024 年 1 月 25 日《威尼斯盛宴》，臺北聯合管樂團、指揮呂彥慶。","source":"https://www.youtube.com/watch?v=jhhfZr1vGr0","sourceName":"bobomusic","type":"video","sample":false,"youtube":"jhhfZr1vGr0","createdAt":999998}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300013','{"id":300013,"n":"光仁高中・管弦樂團","asset":"moe-1","y":2025,"m":null,"place":"","rel":"樂團介紹照片","story":"教育部藝享青春音樂節團隊介紹所刊載的光仁高中管弦樂團照片。","source":"https://proj.moe.edu.tw/artsfest/News_Content.aspx?n=5424&s=18211&sms=14200","sourceName":"教育部藝享青春","type":"photo","sample":false,"createdAt":999997}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300003','{"id":300003,"n":"FGO 冬日祭・舞台全景","asset":"fgo-1","y":2019,"m":12,"place":"中油大樓國光會議廳","rel":"公開影像紀錄","story":"呂彥慶與台北愛樂管弦樂團合作的冬日祭音樂會，在國光會議廳呈現遊戲配樂。","source":"https://gnn.gamer.com.tw/detail.php?sn=190816","sourceName":"巴哈姆特 GNN","type":"photo","sample":false,"createdAt":999996}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300015','{"id":300015,"n":"浪漫交響詩・公益音樂會","asset":"ntt2025","y":2025,"m":12,"place":"","rel":"音樂會主視覺","story":"2025 年 12 月 9 日，逢甲管弦樂團與葉樹涵在臺中國家歌劇院大劇院同台。","source":"https://www.npac-ntt.org/program/events/c-mab3Kg5kVAr","sourceName":"臺中國家歌劇院","type":"photo","sample":false,"createdAt":999995}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300002','{"id":300002,"n":"手中的指揮棒","asset":"lu-portrait","y":null,"m":null,"place":"","rel":"公開影像紀錄","story":"臺北亞太管樂協會刊載的呂彥慶指揮肖像。","source":"https://tapba.asia/?review=%E5%91%82%E5%BD%A5%E6%85%B6","sourceName":"臺北亞太管樂協會","type":"photo","sample":false,"createdAt":999994}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300020','{"id":300020,"n":"Beyond the Critical Point-K 超越K點","asset":"yt-ZUYgJYOspxg","y":null,"m":null,"place":"","rel":"樂團官方影音選輯","story":"逢甲校友管樂團官網「第三季・聲生不息」影音紀錄。原網頁未標示演出日期。","source":"https://fcuasb.wixsite.com/fcuasb/music-page","sourceName":"逢甲大學校友管樂團／林聖翰","type":"video","sample":false,"youtube":"ZUYgJYOspxg","createdAt":999993}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300004','{"id":300004,"n":"FGO 冬日祭・音樂人的相聚","asset":"fgo-2","y":2019,"m":12,"place":"","rel":"公開影像紀錄","story":"活動合影：安娜・李、三宅一德、呂彥慶與深澤秀行（由左至右）。","source":"https://gnn.gamer.com.tw/detail.php?sn=190816","sourceName":"巴哈姆特 GNN","type":"photo","sample":false,"createdAt":999992}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300012','{"id":300012,"n":"舞動經典・年度公演","asset":"wwy2023","y":2023,"m":12,"place":"","rel":"音樂會主視覺","story":"逢甲管樂與低音管演奏家劉君儀的年度音樂會主視覺。","source":"https://www.npac-weiwuying.org/programs/6513a1731305b60008c33c7c?lang=zh","sourceName":"衛武營國家藝術文化中心","type":"photo","sample":false,"createdAt":999991}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300017','{"id":300017,"n":"掌中隨想曲・光仁高中","asset":"artshow","y":2025,"m":6,"place":"衛武營","rel":"公開影像紀錄","story":"2025 年 6 月 2 日「藝享青春全國特優學校聯合音樂會」演出。教育部藝秀臺收錄完整影片，標示指揮呂彥慶。","source":"https://artshow.edu.tw/video/1004/tc4w7xygm6k6d3t3","sourceName":"教育部藝秀臺","type":"video","sample":false,"externalVideo":"https://artshow.edu.tw/video/1004/tc4w7xygm6k6d3t3","createdAt":999990}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300010','{"id":300010,"n":"詠嘆之歌・大安管樂","asset":"ntt2022","y":2022,"m":7,"place":"","rel":"節目宣傳影像","story":"歌劇院節目頁的樂團宣傳照片，對應與男高音湯發凱合作的《詠嘆之歌》。","source":"https://www.npac-ntt.org/program/events/c-FDCXQSjTnEm","sourceName":"臺中國家歌劇院","type":"photo","sample":false,"createdAt":999989}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300021','{"id":300021,"n":"Oregon","asset":"yt-hbqhHdQXMlY","y":null,"m":null,"place":"","rel":"樂團官方影音選輯","story":"逢甲校友管樂團官網「第三季・聲生不息」影音紀錄。原網頁未標示演出日期。","source":"https://fcuasb.wixsite.com/fcuasb/music-page","sourceName":"逢甲大學校友管樂團／林聖翰","type":"video","sample":false,"youtube":"hbqhHdQXMlY","createdAt":999988}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300007','{"id":300007,"n":"FGO 冬日祭・共同奏響","asset":"fgo-5","y":2019,"m":12,"place":"","rel":"公開影像紀錄","story":"冬日祭演出現場的樂團影像。","source":"https://gnn.gamer.com.tw/detail.php?sn=190816","sourceName":"巴哈姆特 GNN","type":"photo","sample":false,"createdAt":999987}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300009','{"id":300009,"n":"西城故事・音樂會主視覺","asset":"ntt2020","y":2020,"m":12,"place":"","rel":"音樂會主視覺","story":"逢甲管樂與盧易之的《西城故事》，2020 年 12 月 30 日於臺中國家歌劇院中劇院演出。","source":"https://www.npac-ntt.org/program/events/c-q03LOySiutI","sourceName":"臺中國家歌劇院","type":"photo","sample":false,"createdAt":999986}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300022','{"id":300022,"n":"アニメ‧メドしー久石讓作品集","asset":"yt-p__YbRN7sic","y":null,"m":null,"place":"","rel":"樂團官方影音選輯","story":"逢甲校友管樂團官網「第三季・聲生不息」影音紀錄。原網頁未標示演出日期。","source":"https://fcuasb.wixsite.com/fcuasb/music-page","sourceName":"逢甲大學校友管樂團／林聖翰","type":"video","sample":false,"youtube":"p__YbRN7sic","createdAt":999985}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300014','{"id":300014,"n":"老師的音樂教育足跡","asset":"moe-2","y":2025,"m":null,"place":"","rel":"公開影像紀錄","story":"教育部活動簡介刊載的指揮肖像，記錄老師長年投入合奏教育的歷程。","source":"https://proj.moe.edu.tw/artsfest/News_Content.aspx?n=5424&s=18211&sms=14200","sourceName":"教育部藝享青春","type":"photo","sample":false,"createdAt":999984}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300008','{"id":300008,"n":"大安管樂・衛武營首演紀錄","asset":"wwy2020","y":2020,"m":7,"place":"","rel":"節目宣傳影像","story":"場館節目頁刊載的樂團宣傳照片。2020 年 7 月 20 日，大安管樂首次於衛武營音樂廳演出。","source":"https://www.npac-weiwuying.org/programs/5ee1194858ad3900060b7d3a?lang=zh","sourceName":"衛武營國家藝術文化中心","type":"photo","sample":false,"createdAt":999983}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300023','{"id":300023,"n":"Gregson Tuba Concerto Ⅰ","asset":"yt-xYxk_BAfSm0","y":null,"m":null,"place":"","rel":"樂團官方影音選輯","story":"逢甲校友管樂團官網「第三季・聲生不息」影音紀錄，低音號獨奏：黎文忠。原網頁未標示演出日期。","source":"https://fcuasb.wixsite.com/fcuasb/music-page","sourceName":"逢甲大學校友管樂團／林聖翰","type":"video","sample":false,"youtube":"xYxk_BAfSm0","createdAt":999982}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300011','{"id":300011,"n":"風之綺想曲・大安管樂","asset":"wwywind","y":2023,"m":7,"place":"","rel":"節目宣傳影像","story":"衛武營節目頁刊載的樂團影像。2023 年巡演邀請鋼琴家林香蒂合作。","source":"https://www.npac-weiwuying.org/programs/6479925358ebc500099654ff?lang=zh","sourceName":"衛武營國家藝術文化中心","type":"photo","sample":false,"createdAt":999981}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300024','{"id":300024,"n":"Gregson Tuba Concerto Ⅱ","asset":"yt-xSVkgUjhec4","y":null,"m":null,"place":"","rel":"樂團官方影音選輯","story":"逢甲校友管樂團官網「第三季・聲生不息」影音紀錄，低音號獨奏：黎文忠。原網頁未標示演出日期。","source":"https://fcuasb.wixsite.com/fcuasb/music-page","sourceName":"逢甲大學校友管樂團／林聖翰","type":"video","sample":false,"youtube":"xSVkgUjhec4","createdAt":999980}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300006','{"id":300006,"n":"FGO 冬日祭・管弦與歌聲","asset":"fgo-4","y":2019,"m":12,"place":"","rel":"公開影像紀錄","story":"台北愛樂管弦樂團與合唱團在冬日祭舞台演出。","source":"https://gnn.gamer.com.tw/detail.php?sn=190816","sourceName":"巴哈姆特 GNN","type":"photo","sample":false,"createdAt":999979}'::jsonb) on conflict do nothing;
insert into archive_private.catalog_entries(kind,entry_id,document) values('memory','300025','{"id":300025,"n":"Gregson Tuba Concerto Ⅲ","asset":"yt-vIV4l7kSjuE","y":null,"m":null,"place":"","rel":"樂團官方影音選輯","story":"逢甲校友管樂團官網「第三季・聲生不息」影音紀錄，低音號獨奏：黎文忠。原網頁未標示演出日期。","source":"https://fcuasb.wixsite.com/fcuasb/music-page","sourceName":"逢甲大學校友管樂團／林聖翰","type":"video","sample":false,"youtube":"vIV4l7kSjuE","createdAt":999978}'::jsonb) on conflict do nothing;
create or replace function public.archive_catalog_public()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('schemaVersion',1,
   'memories',(select coalesce(jsonb_agg(document order by entry_id),'[]'::jsonb) from archive_private.catalog_entries where kind='memory' and deleted_at is null),
   'managedMemoryIds',(select coalesce(jsonb_agg((entry_id)::bigint order by entry_id),'[]'::jsonb) from archive_private.catalog_entries where kind='memory'),
   'biography',(select document from archive_private.catalog_entries where kind='biography' and entry_id='main'),
   'concerts',(select coalesce(jsonb_agg(document order by entry_id),'[]'::jsonb) from archive_private.catalog_entries where kind='concert' and deleted_at is null));
$$;
create or replace function public.archive_catalog_action(p_actor uuid,p_session uuid,p_action text,p_input jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_role text; v_kind text:=p_input->>'kind'; v_id text:=p_input->>'id';
 v_before archive_private.catalog_entries%rowtype; v_after archive_private.catalog_entries%rowtype; v_result jsonb;
begin
 -- Reuse the existing live membership/session check, never user_metadata claims.
 v_role:=public.archive_admin_action(p_actor,p_session,'profile','{}'::jsonb)->>'role';
 if v_role is null or v_kind not in ('concert','biography','memory') then raise exception 'access denied' using errcode='42501'; end if;
 if p_action='list' then
   select coalesce(jsonb_agg(to_jsonb(e) order by entry_id),'[]'::jsonb) into v_result from archive_private.catalog_entries e where kind=v_kind;
   return v_result;
 end if;
 if p_action='history' then
   select coalesce(jsonb_agg(to_jsonb(h) order by revision desc),'[]'::jsonb) into v_result from
     (select revision,actor_id,action,document,deleted_at,created_at from archive_private.catalog_history where kind=v_kind and entry_id=v_id order by revision desc limit 100) h;
   return v_result;
 end if;
 if v_role not in ('system_admin','content_admin') then raise exception 'access denied' using errcode='42501'; end if;
 if v_kind='biography' and v_id<>'main' or v_id is null then raise exception 'invalid id' using errcode='22023'; end if;
 select * into v_before from archive_private.catalog_entries where kind=v_kind and entry_id=v_id for update;
 if coalesce(v_before.revision,0) is distinct from (p_input->>'revision')::integer then raise exception 'edit conflict' using errcode='40001'; end if;
 if p_action='save' then
   if jsonb_typeof(p_input->'document') is distinct from 'object' then raise exception 'invalid document' using errcode='22023'; end if;
   if v_before.revision is null then
     if (select count(*) from archive_private.catalog_entries)>=500 then raise exception 'catalog full' using errcode='22023'; end if;
     insert into archive_private.catalog_entries(kind,entry_id,document) values(v_kind,v_id,p_input->'document') returning * into v_after;
   else
     update archive_private.catalog_entries set document=p_input->'document',revision=revision+1,updated_at=now()
       where kind=v_kind and entry_id=v_id returning * into v_after;
   end if;
 elsif p_action='visibility' then
   if v_kind not in ('concert','memory') or v_before.revision is null or jsonb_typeof(p_input->'deleted') is distinct from 'boolean' then raise exception 'invalid state' using errcode='22023'; end if;
   update archive_private.catalog_entries set deleted_at=case when (p_input->>'deleted')::boolean then now() else null end,revision=revision+1,updated_at=now()
     where kind=v_kind and entry_id=v_id returning * into v_after;
 else raise exception 'invalid action' using errcode='22023'; end if;
 -- Retain original state too, including imported baseline before its first change.
 if v_before.revision is not null then
   insert into archive_private.catalog_history(kind,entry_id,revision,actor_id,action,document,deleted_at)
     values(v_kind,v_id,v_before.revision,p_actor,p_action,v_before.document,v_before.deleted_at) on conflict do nothing;
 end if;
 insert into archive_private.catalog_history(kind,entry_id,revision,actor_id,action,document,deleted_at)
   values(v_kind,v_id,v_after.revision,p_actor,p_action,v_after.document,v_after.deleted_at);
 return to_jsonb(v_after);
exception when unique_violation then raise exception 'edit conflict' using errcode='40001';
end;
$$;
revoke all on function public.archive_catalog_public(),public.archive_catalog_action(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.archive_catalog_public(),public.archive_catalog_action(uuid,uuid,text,jsonb) to service_role;
commit;
