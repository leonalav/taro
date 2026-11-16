use super::*;
use tempfile::tempdir;

fn asset_source(kind: Origin) -> Source {
    Source {
        origin: kind,
        license: Some("CC BY 4.0".into()),
        creator: Some("Studio".into()),
        ..Source::default()
    }
}

fn png() -> Vec<u8> {
    [
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDR".as_slice(),
        &640_u32.to_be_bytes(),
        &480_u32.to_be_bytes(),
        &[8, 2, 0, 0, 0],
    ]
    .concat()
}

#[test]
fn compacts_glb_buffer_views_without_changing_names_or_source_bytes() {
    let root = tempdir().unwrap();
    let store = ProjectAssets::open(root.path()).unwrap();
    let document = r#"{"asset":{"version":"2.0"},"buffers":[{"byteLength":128}],"bufferViews":[{"buffer":0,"byteOffset":16,"byteLength":4},{"buffer":0,"byteOffset":72,"byteLength":4}],"nodes":[{"name":"Product hotspot","extras":{"link":"details"}}]}"#;
    let mut bytes = glb(document);
    let mut binary = [0; 128];
    binary[16..20].copy_from_slice(b"mesh");
    binary[72..76].copy_from_slice(b"mesh");
    bytes.extend_from_slice(&128_u32.to_le_bytes());
    bytes.extend_from_slice(b"BIN\0");
    bytes.extend_from_slice(&binary);
    let length = bytes.len() as u32;
    bytes[8..12].copy_from_slice(&length.to_le_bytes());
    let model = store
        .import(
            "product.glb",
            &bytes,
            asset_source(Origin::Imported),
            AssetOptions::default(),
        )
        .unwrap();
    let compact = store.compact_glb(&model.id, None).unwrap();
    assert_eq!(compact.options.purpose, Purpose::Compressed);
    assert!(compact.file.size < model.original.size);
    let packed = store.read(&model.id, Some(&compact.id)).unwrap();
    let end = 20 + u32::from_le_bytes(packed[12..16].try_into().unwrap()) as usize;
    let updated: serde_json::Value = serde_json::from_slice(&packed[20..end]).unwrap();
    assert_eq!(updated["nodes"][0]["name"], "Product hotspot");
    assert_eq!(updated["nodes"][0]["extras"]["link"], "details");
    assert_eq!(updated["buffers"][0]["byteLength"], 4);
    assert_eq!(&packed[end + 8..], b"mesh");
    let view_offsets: Vec<_> = updated["bufferViews"]
        .as_array()
        .unwrap()
        .iter()
        .map(|view| view["byteOffset"].as_u64().unwrap_or(0))
        .collect();
    assert_eq!(view_offsets, [0, 0]);
    assert_eq!(store.read(&model.id, None).unwrap(), bytes);
    assert!(store.compact_glb(&model.id, Some(&compact.id)).is_err());
    assert_eq!(store.list().unwrap()[0].variants.len(), 1);
}

#[test]
fn invalid_font_copy_creates_no_variant() {
    let root = tempdir().unwrap();
    let store = ProjectAssets::open(root.path()).unwrap();
    let font = store
        .import(
            "brand.woff2",
            b"wOF2invalid",
            asset_source(Origin::Imported),
            AssetOptions::default(),
        )
        .unwrap();
    assert!(store
        .subset_font(&font.id, None, "  ")
        .unwrap_err()
        .contains("page copy"));
    assert!(store.list().unwrap()[0].variants.is_empty());
}

#[test]
fn worktree_selection_copies_only_selected_originals_and_the_approved_asset_lineage() {
    let root = tempdir().unwrap();
    let worktree = tempdir().unwrap();
    let source = ProjectAssets::open(root.path()).unwrap();
    let destination = ProjectAssets::open(worktree.path()).unwrap();
    let model_bytes = glb(r#"{"asset":{"version":"2.0"}}"#);
    let model = source
        .import(
            "product.glb",
            &model_bytes,
            Source::default(),
            AssetOptions::default(),
        )
        .unwrap();
    let font_bytes = b"wOF2fixture";
    let font = source
        .import(
            "brand.woff2",
            font_bytes,
            Source::default(),
            AssetOptions::default(),
        )
        .unwrap();
    let private = source
        .import(
            "unrelated.png",
            &png(),
            Source::default(),
            AssetOptions::default(),
        )
        .unwrap();
    let prepared = source
        .add_variant(
            &model.id,
            "prepared.glb",
            &model_bytes,
            VariantOptions {
                purpose: Purpose::Delivery,
                request: "product geometry for use".into(),
                ..VariantOptions::default()
            },
        )
        .unwrap();
    let delivery = source
        .add_variant(
            &model.id,
            "compressed.glb",
            &model_bytes,
            VariantOptions {
                purpose: Purpose::Compressed,
                request: "compact version for delivery".into(),
                parent_variant: Some(prepared.id.clone()),
                ..VariantOptions::default()
            },
        )
        .unwrap();
    let preview = source
        .add_variant(
            &model.id,
            "poster.png",
            &png(),
            VariantOptions {
                purpose: Purpose::Preview,
                request: "still for the delivered model".into(),
                parent_variant: Some(delivery.id.clone()),
                ..VariantOptions::default()
            },
        )
        .unwrap();
    let alternative = source
        .add_variant(
            &model.id,
            "other.glb",
            &model_bytes,
            VariantOptions {
                purpose: Purpose::Replacement,
                request: "unused private model".into(),
                ..VariantOptions::default()
            },
        )
        .unwrap();
    source
        .set_approval(
            &model.id,
            model.revision,
            Some(AssetApproval {
                variant_id: Some(delivery.id.clone()),
            }),
        )
        .unwrap();
    let ids = [model.id.clone(), font.id.clone()];
    let records = source.stage_selection(&destination, &ids).unwrap();
    assert_eq!(records.len(), 2);
    let copied_model = records.iter().find(|record| record.id == model.id).unwrap();
    assert_eq!(
        copied_model
            .approval
            .as_ref()
            .unwrap()
            .variant_id
            .as_deref(),
        Some(delivery.id.as_str())
    );
    assert_eq!(copied_model.variants.len(), 3);
    for variant in [prepared, delivery, preview] {
        assert_eq!(
            destination.read(&model.id, Some(&variant.id)).unwrap(),
            source.read(&model.id, Some(&variant.id)).unwrap()
        );
        assert!(worktree.path().join(variant.file.path).is_file());
    }
    assert!(destination.read(&model.id, Some(&alternative.id)).is_err());
    assert!(destination.read(&private.id, None).is_err());
    assert_eq!(destination.read(&font.id, None).unwrap(), font_bytes);
    assert!(worktree.path().join(&font.original.path).is_file());
    assert_eq!(records, source.stage_selection(&destination, &ids).unwrap());

    // An independent edit in the destination cannot change the source product or be overwritten.
    let dest_file = worktree.path().join(&model.original.path);
    let changed = vec![b'x'; model_bytes.len()];
    fs::write(&dest_file, &changed).unwrap();
    assert!(source
        .stage_selection(&destination, &ids)
        .unwrap_err()
        .contains("worktree"));
    assert_eq!(fs::read(dest_file).unwrap(), changed);
    assert_eq!(source.read(&model.id, None).unwrap(), model_bytes);
}

#[cfg(any(unix, windows))]
#[test]
fn worktree_staging_refuses_linked_asset_storage() {
    let original = tempdir().unwrap();
    let worktree = tempdir().unwrap();
    let outside = tempdir().unwrap();
    let source = ProjectAssets::open(original.path()).unwrap();
    let destination = ProjectAssets::open(worktree.path()).unwrap();
    let asset = source
        .import(
            "project.png",
            &png(),
            Source::default(),
            AssetOptions::default(),
        )
        .unwrap();
    let link = worktree.path().join(DIRECTORY);
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), &link).unwrap();
    #[cfg(windows)]
    {
        let output = std::process::Command::new("cmd.exe")
            .args(["/C", "mklink", "/J"])
            .arg(&link)
            .arg(outside.path())
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    assert!(source
        .stage_selection(&destination, &[asset.id])
        .unwrap_err()
        .contains("link"));
    assert_eq!(outside.path().read_dir().unwrap().count(), 0);
}

#[test]
fn portable_records_survive_reopen_and_are_workspace_scoped() {
    let a = tempdir().unwrap();
    let b = tempdir().unwrap();
    let storage = ProjectAssets::open(a.path()).unwrap();
    let created = storage
        .import(
            "reference.png",
            &png(),
            asset_source(Origin::Imported),
            AssetOptions::default(),
        )
        .unwrap();
    let id = created.id.clone();
    assert_eq!(created.original.width, Some(640));
    assert_eq!(created.original.height, Some(480));
    assert_eq!(created.source.creator.as_deref(), Some("Studio"));
    assert_eq!(created.original.sha256.len(), 64);
    assert!(a.path().join(&created.original.path).is_file());
    let reopened = ProjectAssets::open(a.path()).unwrap();
    assert_eq!(reopened.list().unwrap(), vec![created]);
    assert_eq!(reopened.read(&id, None).unwrap(), png());
    assert!(ProjectAssets::open(b.path())
        .unwrap()
        .read(&id, None)
        .is_err());
    assert!(ProjectAssets::open(b.path())
        .unwrap()
        .list()
        .unwrap()
        .is_empty());
}

#[test]
fn accepted_types_have_matching_signatures_and_model_is_self_contained() {
    let root = tempdir().unwrap();
    let storage = ProjectAssets::open(root.path()).unwrap();
    for (name, bytes, expected) in [
        ("brand.woff2", b"wOF2fake-font".to_vec(), Kind::Font),
        (
            "studio.hdr",
            b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 64 +X 128\n".to_vec(),
            Kind::Environment,
        ),
        (
            "material.ktx2",
            b"\xabKTX 20\xbb\r\n\x1a\n".to_vec(),
            Kind::Texture,
        ),
        ("hero.png", png(), Kind::Image),
        (
            "film.webm",
            b"\x1a\x45\xdf\xa3\x9f\x42\x82\x84webm".to_vec(),
            Kind::Video,
        ),
        (
            "product.glb",
            glb(r#"{"asset":{"version":"2.0"}}"#),
            Kind::Model,
        ),
    ] {
        let item = storage
            .import(
                name,
                &bytes,
                asset_source(Origin::Imported),
                AssetOptions::default(),
            )
            .unwrap();
        assert_eq!(item.kind, expected);
        assert_eq!(storage.read(&item.id, None).unwrap(), bytes);
    }
    for (name, bytes) in [
        ("bad.png", b"bad bytes".to_vec()),
        ("bad.html", png()),
        ("bad.svg", b"<svg/>".to_vec()),
        (
            "bad.glb",
            glb(r#"{"asset":{"version":"2.0"},"images":[{"uri":"https://example.com/ref.png"}]}"#),
        ),
        (
            "bad.glb",
            glb(r#"{"asset":{"version":"2.0"},"buffers":{}}"#),
        ),
    ] {
        assert!(
            storage
                .import(
                    name,
                    &bytes,
                    asset_source(Origin::Imported),
                    AssetOptions::default()
                )
                .is_err(),
            "{name}"
        );
    }
    assert_eq!(storage.list().unwrap().len(), 6);
}

fn glb(json: &str) -> Vec<u8> {
    let mut chunk = json.as_bytes().to_vec();
    while chunk.len() % 4 != 0 {
        chunk.push(b' ');
    }
    [
        b"glTF".as_slice(),
        &2_u32.to_le_bytes(),
        &(20 + chunk.len() as u32).to_le_bytes(),
        &(chunk.len() as u32).to_le_bytes(),
        b"JSON",
        &chunk,
    ]
    .concat()
}

#[test]
fn variants_preserve_originals_and_retry_without_duplicate_records() {
    let root = tempdir().unwrap();
    let storage = ProjectAssets::open(root.path()).unwrap();
    let original = storage
        .import(
            "hero.png",
            &png(),
            asset_source(Origin::Imported),
            AssetOptions::default(),
        )
        .unwrap();
    let mut cropped = png();
    cropped[16..20].copy_from_slice(&320_u32.to_be_bytes());
    let options = VariantOptions {
        purpose: Purpose::Crop,
        request: "Keep the crop on the subject".into(),
        target_width: Some(320),
        target_height: Some(480),
        focal: Some(FocalPoint { x: 0.35, y: 0.55 }),
        ..VariantOptions::default()
    };
    let variant = storage
        .add_variant(&original.id, "crop.png", &cropped, options.clone())
        .unwrap();
    assert_eq!(
        variant,
        storage
            .add_variant(&original.id, "crop.png", &cropped, options)
            .unwrap()
    );
    let restored = ProjectAssets::open(root.path()).unwrap().list().unwrap();
    assert_eq!(restored[0].variants, vec![variant.clone()]);
    assert_ne!(variant.file.path, original.original.path);
    assert_eq!(storage.read(&original.id, None).unwrap(), png());
    assert_eq!(
        storage.read(&original.id, Some(&variant.id)).unwrap(),
        cropped
    );
    assert!(storage
        .add_variant(&original.id, "crop.png", b"bad", VariantOptions::default())
        .is_err());
    assert_eq!(storage.list().unwrap()[0].variants.len(), 1);
}

#[test]
fn approved_version_survives_reopen_and_preserves_generated_provenance() {
    let root = tempdir().unwrap();
    let store = ProjectAssets::open(root.path()).unwrap();
    let original = store
        .import(
            "product.png",
            &png(),
            Source::default(),
            AssetOptions::default(),
        )
        .unwrap();
    let variant = store
        .add_variant(
            &original.id,
            "styled.png",
            &png(),
            VariantOptions {
                purpose: Purpose::BackgroundEdit,
                request: "Create campaign artwork".into(),
                source: Some(Source {
                    origin: Origin::Generated,
                    provider: Some("image plugin".into()),
                    model: Some("image model".into()),
                    request: Some("Create campaign artwork".into()),
                    ..Default::default()
                }),
                ..Default::default()
            },
        )
        .unwrap();
    assert!(store
        .set_approval(
            &original.id,
            1,
            Some(AssetApproval {
                variant_id: Some("unrelated".into())
            })
        )
        .is_err());
    let approval = AssetApproval {
        variant_id: Some(variant.id.clone()),
    };
    let updated = store
        .set_approval(&original.id, 1, Some(approval.clone()))
        .unwrap();
    assert_eq!(updated.approval, Some(approval.clone()));
    assert!(store.set_approval(&original.id, 1, None).is_err());
    let reopened = ProjectAssets::open(root.path())
        .unwrap()
        .list()
        .unwrap()
        .remove(0);
    assert_eq!(reopened.approval, Some(approval.clone()));
    assert!(reopened.variants[0].candidate);
    assert_eq!(
        reopened.variants[0].options.source.as_ref().unwrap().origin,
        Origin::Generated
    );
    let edited = store
        .update(
            &original.id,
            reopened.revision,
            MetadataUpdate {
                usage: vec!["Campaign hero".into()],
                ..Default::default()
            },
        )
        .unwrap();
    assert_eq!(edited.approval, Some(approval));
    assert_eq!(
        store
            .set_approval(&original.id, edited.revision, None)
            .unwrap()
            .approval,
        None
    );
    fs::remove_file(root.path().join(&variant.file.path)).unwrap();
    assert!(store
        .set_approval(
            &original.id,
            edited.revision + 1,
            Some(AssetApproval {
                variant_id: Some(variant.id)
            })
        )
        .is_err());
}

#[test]
fn failed_or_missing_assets_report_unavailable() {
    let root = tempdir().unwrap();
    let storage = ProjectAssets::open(root.path()).unwrap();
    let src = asset_source(Origin::Generated);
    assert!(storage
        .import(
            "candidate.png",
            &png(),
            src.clone(),
            AssetOptions::default()
        )
        .is_err());
    assert!(storage.list().unwrap().is_empty());
    let src = Source {
        provider: Some("provider".into()),
        model: Some("image-model".into()),
        request: Some("Draw an original illustration".into()),
        ..src
    };
    let created = storage
        .import("candidate.png", &png(), src, AssetOptions::default())
        .unwrap();
    assert_eq!(created.source.origin, Origin::Generated);
    assert!(created.candidate);
    assert!(storage.read("../other", None).is_err());
    std::fs::remove_file(root.path().join(&created.original.path)).unwrap();
    let reopened = ProjectAssets::open(root.path()).unwrap().list().unwrap();
    assert!(!reopened[0].original.available);
    assert!(storage.read(&created.id, None).is_err());
}

#[test]
fn metadata_revision_updates_preserve_original_and_reject_conflicts() {
    let root = tempdir().unwrap();
    let storage = ProjectAssets::open(root.path()).unwrap();
    let first = storage
        .import(
            "hero.png",
            &png(),
            Source::default(),
            AssetOptions::default(),
        )
        .unwrap();
    let update = MetadataUpdate {
        creator: Some("Studio".into()),
        license: Some("CC BY 4.0".into()),
        usage: vec!["Editorial hero".into()],
        restrictions: Some("Credit under the image".into()),
        ..MetadataUpdate::default()
    };
    let second = storage.update(&first.id, 1, update.clone()).unwrap();
    assert_eq!(second.revision, 2);
    assert_eq!(second.original, first.original);
    assert_eq!(second.usage, ["Editorial hero"]);
    assert!(storage
        .update(&first.id, 1, update)
        .unwrap_err()
        .contains("revision"));
    assert_eq!(storage.list().unwrap(), [second]);
}

#[test]
fn successful_simultaneous_retries_share_one_asset_and_abandoned_staging_is_invisible() {
    let root = tempdir().unwrap();
    let barrier = std::sync::Barrier::new(2);
    let root = root.path();
    let assets = std::thread::scope(|scope| {
        let import = || {
            let store = ProjectAssets::open(root).unwrap();
            barrier.wait();
            store
                .import(
                    "brand.woff2",
                    b"wOF2font",
                    Source::default(),
                    AssetOptions::default(),
                )
                .unwrap()
        };
        let left = scope.spawn(import);
        let right = scope.spawn(import);
        [left.join().unwrap(), right.join().unwrap()]
    });
    assert_eq!(assets[0], assets[1]);
    let assets_dir = root.join("taro-assets");
    fs::create_dir(assets_dir.join(".pending-interrupted")).unwrap();
    assert_eq!(
        ProjectAssets::open(root).unwrap().list().unwrap(),
        [assets[0].clone()]
    );
}

#[test]
fn generated_edits_record_provenance_and_require_their_exact_parent() {
    let root = tempdir().unwrap();
    let storage = ProjectAssets::open(root.path()).unwrap();
    let original = storage
        .import(
            "hero.png",
            &png(),
            Source::default(),
            AssetOptions::default(),
        )
        .unwrap();
    let request = VariantOptions {
        purpose: Purpose::BackgroundEdit,
        request: "Change the background".into(),
        source: Some(Source {
            origin: Origin::Generated,
            provider: Some("provider".into()),
            model: Some("image-model".into()),
            request: Some("Replace the background with blue".into()),
            ..Source::default()
        }),
        ..VariantOptions::default()
    };
    let prepared = storage
        .add_variant(&original.id, "prepared.png", &png(), request.clone())
        .unwrap();
    assert_eq!(
        prepared.options.source.as_ref().unwrap().origin,
        Origin::Generated
    );
    let child = VariantOptions {
        parent_variant: Some(prepared.id.clone()),
        ..request
    };
    fs::remove_file(root.path().join(&prepared.file.path)).unwrap();
    assert!(storage
        .add_variant(&original.id, "another.png", &png(), child)
        .is_err());
    assert_eq!(storage.list().unwrap()[0].variants.len(), 1);
    assert_eq!(storage.read(&original.id, None).unwrap(), png());
}

#[test]
fn checksum_mismatch_prevents_loading_changed_bytes_even_when_size_matches() {
    let root = tempdir().unwrap();
    let storage = ProjectAssets::open(root.path()).unwrap();
    let original = storage
        .import(
            "brand.woff2",
            b"wOF2font",
            Source::default(),
            AssetOptions::default(),
        )
        .unwrap();
    fs::write(root.path().join(&original.original.path), b"wOF2edit").unwrap();
    assert!(storage
        .read(&original.id, None)
        .unwrap_err()
        .contains("checksum"));
}
