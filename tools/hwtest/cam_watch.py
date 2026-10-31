"""Camera-only watcher: prints the wall brightness every few seconds (no BLE)."""
import sys, time
import cv2, numpy as np

duration = float(sys.argv[1]) if len(sys.argv) > 1 else 60
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
for _ in range(20):
    cap.read()
cap.set(cv2.CAP_PROP_AUTO_WB, 0)
cap.set(cv2.CAP_PROP_WB_TEMPERATURE, 4600)
cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.25)
cap.set(cv2.CAP_PROP_AUTOFOCUS, 0)
cap.set(cv2.CAP_PROP_GAIN, 0)
cap.set(cv2.CAP_PROP_EXPOSURE, -9)
for _ in range(10):
    cap.read()
start = time.time()
while time.time() - start < duration:
    for _ in range(4):
        cap.read()
    frame = np.mean([cap.read()[1].astype(np.float32) for _ in range(4)], axis=0)
    wall = frame[: int(frame.shape[0] * 0.4)]
    b, g, r = wall.reshape(-1, 3).mean(0)
    print(f"t={time.time()-start:5.1f}s R {r:6.1f} G {g:6.1f} B {b:6.1f}", flush=True)
    time.sleep(2.5)
cap.release()
