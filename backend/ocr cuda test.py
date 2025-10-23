import torch

# 1. Проверяем версию PyTorch. В версии для GPU должен быть суффикс, например "+cu121"
print(f"Установленная версия PyTorch: {torch.__version__}")

# 2. Проверяем доступность CUDA
is_available = torch.cuda.is_available()
print(f"CUDA доступна: {is_available}")

# 3. Если все хорошо, выводим название видеокарты
if is_available:
    print(f"Название видеокарты: {torch.cuda.get_device_name(0)}")
else:
    # 4. Если CUDA не найдена, даем подсказку
    if "+" in torch.__version__:
        print("Версия PyTorch для GPU установлена, но не может связаться с драйвером. Попробуйте перезагрузить компьютер.")
    else:
        print("Установлена версия PyTorch только для CPU. Пожалуйста, повторите шаги по переустановке.")
